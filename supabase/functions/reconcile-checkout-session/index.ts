// Synchronously reconcile a Stripe Checkout session.
//
// Why this exists:
//   The Stripe webhook is the authoritative provisioner, but webhook
//   delivery can lag 5–60s (sometimes longer). During that window a
//   freshly-paid customer can hit AdminRoute / check-subscription and
//   get bounced to /pricing because their org isn't flagged yet. This
//   function lets the CheckoutSuccessPage pull the session directly
//   from Stripe and provision access immediately for ALL paid plans
//   (Lifetime, Basic, Pro, Custom) — fully idempotent, safe to run
//   before/after the webhook fires.
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
    // status flips to active/trialing OR the session is complete.
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
    const email = (
      session.customer_details?.email ??
      session.customer_email ??
      (session.metadata?.email as string | undefined) ??
      ""
    ).toLowerCase() || null;

    let userId: string | null =
      (session.metadata?.user_id as string | undefined) ||
      (session.metadata?.account_id as string | undefined) ||
      null;

    // Resolve user by email if metadata didn't carry an id
    if (!userId && email) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (profile?.id) userId = profile.id;
    }

    // Provision a brand-new account if needed (anonymous checkout for
    // any paid plan — Lifetime/Basic/Pro/Custom). The invite email
    // doubles as the "set your password" link.
    const fullName = session.customer_details?.name ?? null;
    let isNewAccount = false;
    const ensureAccount = async (planTypeForNewOrg: string) => {
      if (userId || !email) return;
      try {
        const appUrl = Deno.env.get("APP_URL") || "https://jointidywise.com";
        const nextUrl = `/checkout/success?from_invite=1&session_id=${session.id}`;
        const inviteUrl = `${appUrl}/auth/callback?next=${encodeURIComponent(nextUrl)}`;
        const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo: inviteUrl,
            data: fullName ? { full_name: fullName } : undefined,
          },
        );
        const inviteErrMsg = inviteErr?.message?.toLowerCase() ?? "";
        const alreadyRegistered =
          inviteErr && (
            inviteErrMsg.includes("already") ||
            inviteErrMsg.includes("registered") ||
            inviteErrMsg.includes("exists")
          );
        if (alreadyRegistered) {
          try {
            const { data: existing } = await (supabase.auth.admin as unknown as {
              getUserByEmail: (e: string) => Promise<{ data: { user?: { id: string } | null } }>
            }).getUserByEmail(email);
            if (existing?.user?.id) userId = existing.user.id;
          } catch (e) {
            console.error("[reconcile] getUserByEmail failed:", e);
          }
        } else if (!inviteErr && invited?.user?.id) {
          userId = invited.user.id;
          isNewAccount = true;
          await supabase.from("profiles").insert({
            id: userId,
            email,
            full_name: fullName,
          });
          const orgName = fullName ? `${fullName}'s Business` : "My Cleaning Business";
          const { data: newOrg } = await supabase
            .from("organizations")
            .insert({ name: orgName, plan_type: planTypeForNewOrg })
            .select("id")
            .single();
          if (newOrg?.id) {
            await supabase.from("org_memberships").insert({
              organization_id: newOrg.id,
              user_id: userId,
              role: "owner",
            });
            log("provisioned new account", { userId, orgId: newOrg.id, plan: planTypeForNewOrg });
          }
        } else if (inviteErr) {
          console.error("[reconcile] inviteUserByEmail failed:", inviteErr);
        }
      } catch (e) {
        console.error("[reconcile] account provisioning error:", e);
      }
    };

    const getOrgId = async (): Promise<string | null> => {
      if (!userId) return null;
      const { data: mem } = await supabase
        .from("org_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      return mem?.organization_id ?? null;
    };

    // ── Lifetime branch ────────────────────────────────────────────────
    if (plan === "lifetime") {
      if (!email) {
        return new Response(JSON.stringify({ error: "No email on session" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await ensureAccount("lifetime");

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

      const orgId = await getOrgId();
      if (orgId) {
        // NOTE: do NOT set grandfathered_lifetime here. That flag is
        // reserved for original launch/founder users.
        await supabase
          .from("organizations")
          .update({ plan_type: "lifetime" })
          .eq("id", orgId);
        await supabase
          .from("lifetime_access_purchases")
          .update({ organization_id: orgId })
          .eq("stripe_session_id", session.id);
        await supabase.from("stripe_subscriptions").upsert(
          {
            organization_id: orgId,
            stripe_subscription_id: `lifetime_${session.id}`,
            stripe_customer_id: (session.customer as string) || null,
            status: "active",
            plan: "lifetime",
            current_period_end: null,
          },
          { onConflict: "stripe_subscription_id", ignoreDuplicates: true },
        );
      }

      try { await supabase.rpc("claim_lifetime_spot"); } catch (_) { /* ignored */ }

      log("lifetime reconciled", { email, userId, isNewAccount });
      return new Response(
        JSON.stringify({
          ok: true,
          provisioned: true,
          plan: "lifetime",
          email,
          hasAccount: !!userId,
          isNewAccount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Subscription branch (Basic / Pro / Custom / Standard) ──────────
    if (session.mode === "subscription" && session.subscription) {
      const planFromMetadata = session.metadata?.tidywise_plan as string | undefined;
      const targetPlanType =
        planFromMetadata && ["basic", "pro", "custom"].includes(planFromMetadata)
          ? planFromMetadata
          : (plan && ["basic", "pro", "custom"].includes(plan) ? plan : "standard");

      if (!email) {
        log("subscription session has no email — skipping provisioning");
        return new Response(
          JSON.stringify({ ok: true, provisioned: false, plan: targetPlanType, reason: "no_email" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await ensureAccount(targetPlanType);

      const orgId = await getOrgId();
      if (orgId) {
        // Always set the org's plan_type so feature gates open
        // immediately — even if the org already existed.
        await supabase
          .from("organizations")
          .update({ plan_type: targetPlanType })
          .eq("id", orgId);

        // Mirror the live Stripe subscription into stripe_subscriptions
        // so the paywall opens before the webhook arrives.
        try {
          const stripeSubId = typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription as { id?: string })?.id;
          if (stripeSubId) {
            const fullSub = await stripe.subscriptions.retrieve(stripeSubId);
            const currentPeriodEnd = fullSub.current_period_end
              ? new Date(fullSub.current_period_end * 1000).toISOString()
              : null;
            await supabase.from("stripe_subscriptions").upsert(
              {
                organization_id: orgId,
                stripe_subscription_id: fullSub.id,
                stripe_customer_id: (fullSub.customer as string) || null,
                status: fullSub.status,
                plan: targetPlanType,
                current_period_end: currentPeriodEnd,
              },
              { onConflict: "stripe_subscription_id", ignoreDuplicates: false },
            );
          }
        } catch (mirrorErr) {
          console.error("[reconcile] mirror sub failed:", mirrorErr);
        }
      }

      log("subscription reconciled", { email, userId, plan: targetPlanType, isNewAccount });
      return new Response(
        JSON.stringify({
          ok: true,
          provisioned: true,
          plan: targetPlanType,
          email,
          hasAccount: !!userId,
          isNewAccount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log("session ack'd (no provisioning needed)", { plan, email });
    return new Response(
      JSON.stringify({
        ok: true,
        provisioned: false,
        plan,
        email,
        hasAccount: !!userId,
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
