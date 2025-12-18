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

interface CancelHoldRequest {
  paymentIntentId: string;
  cancellationReason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paymentIntentId, cancellationReason }: CancelHoldRequest = await req.json();

    console.log("Canceling payment hold:", { paymentIntentId, cancellationReason });

    if (!paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "Payment Intent ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Retrieve the payment intent to check its status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log("Payment intent status:", paymentIntent.status);

    // Can only cancel if the payment is in requires_capture (held) or requires_payment_method state
    if (paymentIntent.status !== "requires_capture" && paymentIntent.status !== "requires_payment_method") {
      return new Response(
        JSON.stringify({ 
          error: `Cannot cancel hold. Current status: ${paymentIntent.status}. Can only cancel holds that are pending capture.`,
          status: paymentIntent.status 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Cancel the payment intent to release the hold
    const canceledPayment = await stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: "requested_by_customer",
    });

    console.log("Payment hold canceled successfully:", canceledPayment.id);

    const heldAmount = paymentIntent.amount / 100;

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
