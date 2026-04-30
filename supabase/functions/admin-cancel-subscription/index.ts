import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_EMAIL = "support@tidywisecleaning.com";

const log = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-CANCEL-SUB] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify the user is the platform admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userEmail = claimsData.claims.email as string | undefined;
    if (!userEmail || userEmail.toLowerCase() !== PLATFORM_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Platform admin access only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    let { subscriptionId, customerEmail, immediate } = body as {
      subscriptionId?: string;
      customerEmail?: string;
      immediate?: boolean;
    };

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // If no subscriptionId given, look it up by email
    if (!subscriptionId) {
      if (!customerEmail) {
        return new Response(
          JSON.stringify({ error: "subscriptionId or customerEmail required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (customers.data.length === 0) {
        return new Response(JSON.stringify({ error: "No Stripe customer found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const subs = await stripe.subscriptions.list({
        customer: customers.data[0].id,
        status: "all",
        limit: 10,
      });
      const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
      if (!active) {
        return new Response(JSON.stringify({ error: "No cancelable subscription found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      subscriptionId = active.id;
    }

    log("Cancelling subscription", { subscriptionId, immediate, by: userEmail });

    const result = immediate
      ? await stripe.subscriptions.cancel(subscriptionId)
      : await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: result.id,
        status: result.status,
        cancel_at_period_end: (result as any).cancel_at_period_end ?? false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
