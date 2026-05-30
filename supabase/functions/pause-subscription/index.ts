// Pause the user's TidyWise CRM (platform) subscription for 1/2/3 months
// via Stripe pause_collection with a resumes_at. Does not cancel.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { authenticateUser } from "../_shared/auth-org.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[PAUSE-SUB] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

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
    const { supabase, userId, userEmail, organizationId } = auth.ctx;

    const body = await req.json().catch(() => ({}));
    const months = Number(body?.months);
    if (![1, 2, 3].includes(months)) {
      return new Response(JSON.stringify({ error: "months must be 1, 2, or 3" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const active = subs.data.find((s) =>
      ["active", "trialing", "past_due"].includes(s.status),
    );
    if (!active) {
      return new Response(JSON.stringify({ error: "No active subscription to pause" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resumeDate = new Date();
    resumeDate.setMonth(resumeDate.getMonth() + months);
    const resumesAtSec = Math.floor(resumeDate.getTime() / 1000);

    const updated = await stripe.subscriptions.update(active.id, {
      pause_collection: { behavior: "void", resumes_at: resumesAtSec },
    });
    log("Paused", { sub: active.id, months, resumes_at: resumesAtSec });

    await supabase.from("subscription_pauses").insert({
      organization_id: organizationId,
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: active.id,
      resume_date: resumeDate.toISOString(),
      pause_months: months,
      status: "active",
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: updated.id,
        resume_date: resumeDate.toISOString(),
        pause_months: months,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
