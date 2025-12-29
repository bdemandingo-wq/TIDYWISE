import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CapturePaymentRequest {
  paymentIntentId: string;
  amountToCapture?: number;
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

    const { paymentIntentId, amountToCapture, organizationId }: CapturePaymentRequest = await req.json();

    // SECURITY: Verify organization context matches authenticated user
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (organizationId !== authResult.organizationId) {
      console.error("Organization mismatch in capture-payment");
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { reason: "Organization mismatch", requestedOrg: organizationId },
      });
      return createForbiddenResponse("Access denied: organization mismatch", corsHeaders);
    }

    console.log("Capturing payment:", { paymentIntentId, amountToCapture, userId: authResult.userId });

    if (!paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "Payment Intent ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log("Payment intent status:", paymentIntent.status);

    if (paymentIntent.status !== "requires_capture") {
      return new Response(
        JSON.stringify({ 
          error: `Cannot capture payment. Current status: ${paymentIntent.status}`,
          status: paymentIntent.status 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const captureParams: Stripe.PaymentIntentCaptureParams = {};
    
    if (amountToCapture) {
      captureParams.amount_to_capture = Math.round(amountToCapture * 100);
    }

    const capturedPayment = await stripe.paymentIntents.capture(
      paymentIntentId,
      captureParams
    );

    const capturedAmount = capturedPayment.amount_received / 100;

    // Log successful payment capture
    await logAudit({
      action: AuditActions.PAYMENT_CAPTURE,
      userId: authResult.userId!,
      organizationId: authResult.organizationId!,
      details: { 
        paymentIntentId: capturedPayment.id, 
        amount: capturedAmount 
      },
    });

    console.log("Payment captured successfully:", capturedPayment.id);

    return new Response(JSON.stringify({ 
      success: true, 
      paymentIntentId: capturedPayment.id,
      status: capturedPayment.status,
      amountCaptured: capturedAmount,
      message: `Payment of $${capturedAmount.toFixed(2)} captured successfully.`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in capture-payment function:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
