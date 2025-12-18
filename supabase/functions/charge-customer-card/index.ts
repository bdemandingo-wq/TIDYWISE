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

interface HoldCardRequest {
  email: string;
  amount: number;
  description?: string;
  bookingId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, amount, description, bookingId }: HoldCardRequest = await req.json();

    console.log("Placing hold on customer card:", { email, amount, description, bookingId });

    if (!email || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields (email and amount)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the customer in Stripe
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ error: "Customer not found. Please save a card first." }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const customerId = customers.data[0].id;
    console.log("Found customer:", customerId);

    // Get the customer's default payment method
    const customer = await stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      return new Response(
        JSON.stringify({ error: "Customer has been deleted" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let paymentMethodId = customer.invoice_settings?.default_payment_method as string;
    
    if (!paymentMethodId) {
      // Try to get any attached payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });

      if (paymentMethods.data.length === 0) {
        return new Response(
          JSON.stringify({ error: "No payment method on file for this customer" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      paymentMethodId = paymentMethods.data[0].id;
    }

    // Create a payment intent with capture_method: 'manual' to place a hold without charging
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      capture_method: "manual", // This places a hold but doesn't capture (charge) the funds
      description: description || "Cleaning service hold",
      metadata: {
        bookingId: bookingId || "",
      },
    });

    console.log("Hold placed successfully:", paymentIntent.id, "Status:", paymentIntent.status);

    // Check if the hold was successful
    if (paymentIntent.status === "requires_capture") {
      return new Response(JSON.stringify({ 
        success: true, 
        paymentIntentId: paymentIntent.id,
        status: "hold_placed",
        amount: amount,
        message: `Hold of $${amount.toFixed(2)} placed successfully. Card will be charged after service completion.`
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        error: "Failed to place hold on card"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  } catch (error: any) {
    console.error("Error in hold-customer-card function:", error);
    
    // Handle specific Stripe errors
    if (error.type === "StripeCardError") {
      return new Response(
        JSON.stringify({ 
          success: false,
          declined: true,
          error: `Card declined: ${error.message}`,
          declineCode: error.decline_code || "unknown"
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
