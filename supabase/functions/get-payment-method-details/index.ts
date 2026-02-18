import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GetPaymentMethodRequest {
  paymentMethodId: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paymentMethodId, organizationId }: GetPaymentMethodRequest = await req.json();

    console.log("Getting payment method details for:", paymentMethodId, "org:", organizationId);

    if (!paymentMethodId) {
      return new Response(
        JSON.stringify({ error: "Payment method ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // STRICT ISOLATION: Get org-specific Stripe client via shared helper
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      return new Response(
        JSON.stringify({ error: stripeResult.error || "Stripe not configured for this organization" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const stripe = stripeResult.stripe;

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    return new Response(JSON.stringify({ 
      last4: paymentMethod.card?.last4,
      brand: paymentMethod.card?.brand,
      expMonth: paymentMethod.card?.exp_month,
      expYear: paymentMethod.card?.exp_year,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in get-payment-method-details function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
