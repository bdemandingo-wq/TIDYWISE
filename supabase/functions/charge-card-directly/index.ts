import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChargeRequest {
  email: string;
  amount: number; // in dollars
  description?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, amount, description }: ChargeRequest = await req.json();

    if (!email || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: "Email and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const amountInCents = Math.round(amount * 100);

    // Find customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No customer found with this email. Please save their card first." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = customers.data[0];

    // Get customer's default payment method
    let paymentMethodId: string | undefined;

    if (customer.invoice_settings?.default_payment_method) {
      paymentMethodId = customer.invoice_settings.default_payment_method as string;
    } else {
      // Try to get any attached payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card',
        limit: 1,
      });

      if (paymentMethods.data.length > 0) {
        paymentMethodId = paymentMethods.data[0].id;
      }
    }

    if (!paymentMethodId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No payment method on file. Please save their card first." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create and confirm payment intent immediately
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      customer: customer.id,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: description || 'Booking charge',
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    if (paymentIntent.status === 'succeeded') {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully charged $${amount.toFixed(2)}`,
          paymentIntentId: paymentIntent.id,
          chargedAmount: amount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment status: ${paymentIntent.status}. Please try again.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error charging card:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
