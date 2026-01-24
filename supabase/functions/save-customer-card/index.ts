import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SaveCardRequest {
  email: string;
  customerName: string;
  organizationId: string;
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
    const { email, customerName, organizationId, cardNumber, expMonth, expYear, cvc }: SaveCardRequest = await req.json();

    console.log("Saving card for customer:", { email, customerName, organizationId });

    if (!email || !customerName || !cardNumber || !expMonth || !expYear || !cvc) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // CRITICAL SECURITY: Require organizationId to prevent cross-tenant card access
    if (!organizationId) {
      console.error("SECURITY: Missing organizationId in save-customer-card request");
      return new Response(
        JSON.stringify({ error: "Organization ID is required for security" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get org-specific Stripe client
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      console.error("Failed to get Stripe client:", stripeResult.error);
      return new Response(
        JSON.stringify({ error: stripeResult.error || "Stripe not configured for this organization" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const stripe = stripeResult.stripe;

    // SECURITY FIX: Look for customer with matching email AND organization_id in metadata
    const customers = await stripe.customers.list({ email: email, limit: 100 });
    let customerId: string;
    
    // Find customer that belongs to THIS organization
    const orgCustomer = customers.data.find((c: Stripe.Customer) => {
      return c.metadata?.organization_id === organizationId;
    });
    
    if (orgCustomer) {
      customerId = orgCustomer.id;
      console.log("Found existing org-specific Stripe customer:", customerId);
    } else {
      // Create new customer WITH organization_id in metadata for isolation
      const newCustomer = await stripe.customers.create({
        email: email,
        name: customerName,
        metadata: {
          organization_id: organizationId,
        },
      });
      customerId = newCustomer.id;
      console.log("Created new org-specific Stripe customer:", customerId);
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

    console.log("Card saved successfully for org-specific customer:", customerId);

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
