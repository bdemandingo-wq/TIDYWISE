import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CancelHoldRequest {
  paymentIntentId: string;
  cancellationReason?: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authenticated user with admin privileges
    const authResult = await verifyAdminAuth(req.headers.get("Authorization"), { requireAdmin: true });
    
    if (!authResult.success) {
      console.error("Auth failed:", authResult.error);
      return createUnauthorizedResponse(authResult.error || "Unauthorized", corsHeaders);
    }

    const { paymentIntentId, cancellationReason, organizationId }: CancelHoldRequest = await req.json();

    // SECURITY: Verify organization context matches authenticated user
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (organizationId !== authResult.organizationId) {
      console.error("Organization mismatch in cancel-hold");
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { reason: "Organization mismatch", requestedOrg: organizationId },
      });
      return createForbiddenResponse("Access denied: organization mismatch", corsHeaders);
    }

    console.log("Canceling payment hold:", { paymentIntentId, cancellationReason, userId: authResult.userId });

    if (!paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "Payment Intent ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // STRICT ISOLATION: Get org-specific Stripe client via shared helper
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      console.error("Failed to get Stripe client:", stripeResult.error);
      return new Response(
        JSON.stringify({ error: stripeResult.error || "Stripe not configured for this organization" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const stripe = stripeResult.stripe;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log("Payment intent status:", paymentIntent.status);

    if (paymentIntent.status !== "requires_capture" && paymentIntent.status !== "requires_payment_method") {
      return new Response(
        JSON.stringify({ 
          error: `Cannot cancel hold. Current status: ${paymentIntent.status}. Can only cancel holds that are pending capture.`,
          status: paymentIntent.status 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const canceledPayment = await stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: "requested_by_customer",
    });

    const heldAmount = paymentIntent.amount / 100;

    // Log successful hold cancellation
    await logAudit({
      action: AuditActions.PAYMENT_CANCELLED,
      userId: authResult.userId!,
      organizationId: authResult.organizationId!,
      details: { 
        paymentIntentId: canceledPayment.id, 
        amountReleased: heldAmount,
        reason: cancellationReason 
      },
    });

    console.log("Payment hold canceled successfully:", canceledPayment.id);

    return new Response(JSON.stringify({ 
      success: true, 
      paymentIntentId: canceledPayment.id,
      status: canceledPayment.status,
      amountReleased: heldAmount,
      message: `Hold of $${heldAmount.toFixed(2)} has been released. Funds will be returned to the customer.`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in cancel-hold function:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
