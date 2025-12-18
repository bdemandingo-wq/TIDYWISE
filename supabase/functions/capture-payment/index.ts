import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

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
  amountToCapture?: number; // Optional: capture a different amount than the hold
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paymentIntentId, amountToCapture }: CapturePaymentRequest = await req.json();

    console.log("Capturing payment:", { paymentIntentId, amountToCapture });

    if (!paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "Payment Intent ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Retrieve the payment intent to check its status
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

    // Capture the payment
    const captureParams: Stripe.PaymentIntentCaptureParams = {};
    
    if (amountToCapture) {
      // If a specific amount is provided, capture that amount (in cents)
      captureParams.amount_to_capture = Math.round(amountToCapture * 100);
    }

    const capturedPayment = await stripe.paymentIntents.capture(
      paymentIntentId,
      captureParams
    );

    console.log("Payment captured successfully:", capturedPayment.id);

    const capturedAmount = capturedPayment.amount_received / 100;

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
