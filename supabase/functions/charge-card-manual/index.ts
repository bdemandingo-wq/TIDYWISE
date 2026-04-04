import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { organization_id, customer_name, amount, description } = await req.json();
    if (!organization_id || !customer_name || !amount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify org membership
    const { data: membership } = await supabaseAdmin
      .from("org_memberships")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not authorized for this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Get org Stripe key
    const { data: stripeSettings } = await supabaseAdmin
      .from("org_stripe_settings")
      .select("stripe_secret_key, stripe_access_token")
      .eq("organization_id", organization_id)
      .maybeSingle();

    const stripeKey = stripeSettings?.stripe_access_token || stripeSettings?.stripe_secret_key;
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not connected for this organization" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Create a payment intent (requires a payment method - use for direct charges)
    const amountCents = Math.round(parseFloat(amount) * 100);

    // Create a payment link for manual charge
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      description: `Manual charge: ${customer_name} - ${description || "No description"}`,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        manual_charge: "true",
        customer_name,
        charged_by: user.id,
        organization_id,
      },
    });

    // Log in manual_payments
    await supabaseAdmin.from("manual_payments").insert({
      organization_id,
      customer_name: customer_name.trim(),
      amount: parseFloat(amount),
      description: description?.trim() || null,
      stripe_charge_id: paymentIntent.id,
      created_by: user.id,
    });

    return new Response(JSON.stringify({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("charge-card-manual error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
