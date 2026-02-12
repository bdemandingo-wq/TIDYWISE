import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RefundRequest {
  paymentIntentId: string;
  organizationId: string;
  refundType: "full" | "partial";
  amount?: number; // required for partial, in dollars
  reason?: string;
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

    const { paymentIntentId, organizationId, refundType, amount, reason }: RefundRequest = await req.json();

    // SECURITY: Verify organization context
    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Organization ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (organizationId !== authResult.organizationId) {
      console.error("Organization mismatch in process-refund");
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { reason: "Organization mismatch", requestedOrg: organizationId },
      });
      return createForbiddenResponse("Access denied: organization mismatch", corsHeaders);
    }

    if (!paymentIntentId) {
      return new Response(
        JSON.stringify({ success: false, error: "Payment Intent ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (refundType === "partial" && (!amount || amount <= 0)) {
      return new Response(
        JSON.stringify({ success: false, error: "A valid refund amount is required for partial refunds" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get org-specific Stripe client
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      console.error("Failed to get Stripe client:", stripeResult.error);
      return new Response(
        JSON.stringify({ success: false, error: stripeResult.error || "Stripe not configured for this organization" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const stripe = stripeResult.stripe;

    // Retrieve the payment intent to verify it's refundable
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log("Payment intent status:", paymentIntent.status, "amount:", paymentIntent.amount);

    if (paymentIntent.status !== "succeeded") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Cannot refund. Payment status is "${paymentIntent.status}". Only succeeded payments can be refunded.`,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build refund params
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
      reason: "requested_by_customer",
      metadata: {
        organization_id: organizationId,
        refund_type: refundType,
        admin_user_id: authResult.userId || "",
        admin_reason: reason || "",
      },
    };

    if (refundType === "partial" && amount) {
      const amountInCents = Math.round(amount * 100);
      const maxRefundable = paymentIntent.amount - (paymentIntent.amount_received - paymentIntent.amount);
      
      if (amountInCents > paymentIntent.amount) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Refund amount ($${amount.toFixed(2)}) exceeds the original charge ($${(paymentIntent.amount / 100).toFixed(2)}).`,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      refundParams.amount = amountInCents;
    }

    const refund = await stripe.refunds.create(refundParams);

    const refundedAmount = refund.amount / 100;

    // Log successful refund
    await logAudit({
      action: AuditActions.PAYMENT_CANCELLED,
      userId: authResult.userId!,
      organizationId: authResult.organizationId!,
      details: {
        paymentIntentId,
        refundId: refund.id,
        refundType,
        amount: refundedAmount,
        reason: reason || "Admin initiated refund",
      },
    });

    console.log("Refund processed:", refund.id, "Amount:", refundedAmount);

    const isFullRefund = refundType === "full" || refund.amount === paymentIntent.amount;

    return new Response(
      JSON.stringify({
        success: true,
        refundId: refund.id,
        amount: refundedAmount,
        isFullRefund,
        message: `${isFullRefund ? "Full" : "Partial"} refund of $${refundedAmount.toFixed(2)} processed successfully. Funds will be returned within 5-10 business days.`,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in process-refund:", error);

    const stripeError = error as { type?: string; message?: string };
    let errorMessage = "An unexpected error occurred";

    if (stripeError?.type === "StripeInvalidRequestError") {
      errorMessage = stripeError.message || "Invalid refund request";
    } else if (stripeError?.message) {
      errorMessage = stripeError.message;
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
