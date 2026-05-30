// Resume a paused TidyWise CRM (platform) subscription early.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { authenticateUser } from "../_shared/auth-org.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateUser(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { supabase, userId, userEmail } = auth.ctx;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ error: "No subscription found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "all",
      limit: 10,
    });
    const paused = subs.data.find((s) => (s as any).pause_collection != null);
    if (!paused) {
      return new Response(JSON.stringify({ error: "No paused subscription" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stripe rejects "" for pause_collection — only null clears the pause.
    // Passing "" returned a 400 for every user clicking "Resume now",
    // leaving them stuck in the paused state until pause_collection.resumes_at.
    const updated = await stripe.subscriptions.update(paused.id, {
      pause_collection: null,
    });

    // Mark the active pause row as resumed
    await supabase
      .from("subscription_pauses")
      .update({ status: "resumed", resumed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("stripe_subscription_id", paused.id)
      .eq("status", "active");

    return new Response(
      JSON.stringify({ success: true, subscription_id: updated.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[RESUME-SUB] ERROR", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
