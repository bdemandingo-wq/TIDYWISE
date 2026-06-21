// Synchronously reconcile a Stripe Checkout session.
//
// Why this exists:
//   The Stripe webhook is the authoritative provisioner, but webhook
//   delivery can lag 5–60s (sometimes longer). During that window a
//   freshly-paid customer can hit AdminRoute / check-subscription and
//   get bounced to /pricing because their org isn't flagged lifetime
//   yet. This function lets the CheckoutSuccessPage pull the session
//   directly from Stripe and provision access immediately — fully
//   idempotent, safe to run before/after the webhook fires.
//
// Inputs: { session_id: string }
// Outputs: { ok, provisioned, plan, email, hasAccount }
//
// verify_jwt = false: anonymous-checkout buyers don't have a session
// when they land; their access is unblocked the moment they click the
// invite email. Authenticated buyers also call it, but we don't trust
// their JWT here — Stripe is the source of truth for the purchase.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const log = (msg: string, extra?: unknown) =>
  console.log(`[reconcile-checkout-session] ${msg}`, extra ?? "");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json().catch(() => ({ session_id: null }));
    if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid session_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only act on paid sessions. Subscriptions count as "paid" once
    // status flips to active/trialing.
    const paid =
      session.payment_status === "paid" ||
      session.payment_status === "no_payment_required" ||
      session.status === "complete";
    if (!paid) {
      log("session not paid yet", { id: session.id, status: session.payment_status });
      return new Response(
        JSON.stringify({ ok: true, provisioned: false, reason: "not_paid" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const plan = (session.metadata?.plan as string | undefined) ?? "unknown";
    const email =
      session.customer_details?.email ??
      session.customer_email ??
      (session.metadata?.email as string | undefined) ??
      null;

    let userId: string | null = (session.metadata?.user_id as string | undefined) ?? null;

    // Resolve user by email if metadata didn't carry an id
    if (!userId && email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (profile?.id) userId = profile.id;
    }

    // ── Lifetime branch ────────────────────────────────────────────────
    if (plan === "lifetime") {
      if (!email) {
        return new Response(JSON.stringify({ error: "No email on session" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert purchase record (idempotent on stripe_session_id)
      await supabase
        .from("lifetime_access_purchases")
        .upsert(
          {
            email,
            user_id: userId,
            stripe_session_id: session.id,
            stripe_payment_intent_id: (session.payment_intent as string) || null,
            amount_cents: session.amount_total ?? 30000,
          },
          { onConflict: "stripe_session_id", ignoreDuplicates: true },
        );

      // If user exists, flip their org to lifetime
      if (userId) {
        const { data: membership } = await supabase
          .from("org_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();
        if (membership?.organization_id) {
          await supabase
            .from("organizations")
            .update({
              plan_type: "lifetime",
              grandfathered_lifetime: true,
              grandfathered_at: new Date().toISOString(),
            })
            .eq("id", membership.organization_id);
          await supabase
            .from("lifetime_access_purchases")
            .update({ organization_id: membership.organization_id })
            .eq("stripe_session_id", session.id);
          await supabase.from("stripe_subscriptions").upsert(
            {
              organization_id: membership.organization_id,
              stripe_subscription_id: `lifetime_${session.id}`,
              stripe_customer_id: (session.customer as string) || null,
              status: "active",
              plan: "lifetime",
              current_period_end: null,
            },
            { onConflict: "stripe_subscription_id", ignoreDuplicates: true },
          );
        }
      }

      // Best-effort claim — webhook also claims; the SQL is idempotent.
      try { await supabase.rpc("claim_lifetime_spot"); } catch (_) { /* ignored */ }

      log("lifetime reconciled", { email, userId });
      return new Response(
        JSON.stringify({
          ok: true,
          provisioned: true,
          plan: "lifetime",
          email,
          hasAccount: !!userId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Subscription / other paid sessions ─────────────────────────────
    // For subscription mode the invoice webhook already handles
    // org provisioning; this is just a verification path that returns
    // success so the client can stop polling.
    log("non-lifetime session ack'd", { plan, email });
    return new Response(
      JSON.stringify({
        ok: true,
        provisioned: false,
        plan,
        email,
        hasAccount: !!userId,
        note: "webhook handles subscription provisioning",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reconcile-checkout-session] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
