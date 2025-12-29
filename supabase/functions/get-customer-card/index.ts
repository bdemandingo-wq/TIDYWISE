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

interface GetCardRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: GetCardRequest = await req.json();

    console.log("Getting card info for:", email);

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the customer in Stripe
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    console.log("Stripe customers found:", customers.data.length, customers.data.map((c: { id: string; email: string | null }) => ({ id: c.id, email: c.email })));
    
    if (customers.data.length === 0) {
      console.log("No Stripe customer found for email:", email);
      return new Response(
        JSON.stringify({ hasCard: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const customerId = customers.data[0].id;

    // Get the customer's payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });

    console.log("Payment methods found:", paymentMethods.data.length);

    if (paymentMethods.data.length === 0) {
      console.log("No payment methods found for customer:", customerId);
      return new Response(
        JSON.stringify({ hasCard: false, customerId }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const card = paymentMethods.data[0].card;
    console.log("Card found:", { brand: card?.brand, last4: card?.last4 });

    return new Response(JSON.stringify({ 
      hasCard: true,
      customerId,
      paymentMethodId: paymentMethods.data[0].id,
      last4: card?.last4,
      brand: card?.brand,
      expMonth: card?.exp_month,
      expYear: card?.exp_year,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in get-customer-card function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
