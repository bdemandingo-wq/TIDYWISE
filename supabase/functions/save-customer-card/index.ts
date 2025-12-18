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

interface SaveCardRequest {
  email: string;
  customerName: string;
  cardNumber: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, customerName, cardNumber, expMonth, expYear, cvc }: SaveCardRequest = await req.json();

    console.log("Saving card for customer:", { email, customerName });

    if (!email || !customerName || !cardNumber || !expMonth || !expYear || !cvc) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if customer exists in Stripe, create if not
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    let customerId: string;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("Found existing Stripe customer:", customerId);
    } else {
      const newCustomer = await stripe.customers.create({
        email: email,
        name: customerName,
      });
      customerId = newCustomer.id;
      console.log("Created new Stripe customer:", customerId);
    }

    // Create a payment method using the card details
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number: cardNumber,
        exp_month: expMonth,
        exp_year: expYear,
        cvc: cvc,
      },
    });

    console.log("Created payment method:", paymentMethod.id);

    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethod.id, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });

    console.log("Card saved successfully for customer:", customerId);

    return new Response(JSON.stringify({ 
      success: true, 
      customerId: customerId,
      paymentMethodId: paymentMethod.id,
      last4: paymentMethod.card?.last4,
      brand: paymentMethod.card?.brand,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in save-customer-card function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
