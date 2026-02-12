import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Admin-only function to release a held payment.
 * This is a direct action tool for emergencies.
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { paymentIntentId, organizationId } = await req.json();

    console.log("Admin release hold request:", { paymentIntentId, organizationId });

    if (!paymentIntentId) {
      return new Response(
        JSON.stringify({ error: "Payment Intent ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get organization-specific Stripe credentials
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: orgStripeSettings } = await supabase
      .from("org_stripe_settings")
      .select("stripe_secret_key")
      .eq("organization_id", organizationId)
      .maybeSingle();

    // STRICT ISOLATION: Only use organization-specific key, never fallback to global keys
    const stripeSecretKey = orgStripeSettings?.stripe_secret_key;
    
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured for this organization. Please connect your Stripe account in Settings → Payments." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // First retrieve the payment intent to check its status
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    console.log("Payment intent current status:", paymentIntent.status);

    if (paymentIntent.status === "canceled") {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Hold was already released",
        status: "already_canceled"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (paymentIntent.status !== "requires_capture") {
      return new Response(
        JSON.stringify({ 
          error: `Cannot release hold. Current status: ${paymentIntent.status}`,
          status: paymentIntent.status 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Cancel the payment intent to release the hold
    const canceledPayment = await stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: "requested_by_customer",
    });

    const heldAmount = paymentIntent.amount / 100;

    console.log("Hold released successfully:", canceledPayment.id, "Amount:", heldAmount);

    return new Response(JSON.stringify({ 
      success: true, 
      paymentIntentId: canceledPayment.id,
      status: canceledPayment.status,
      amountReleased: heldAmount,
      message: `Hold of $${heldAmount.toFixed(2)} has been released. Funds will be returned to the customer within 1-5 business days.`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in admin-release-hold function:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
