// Switch an existing Stripe subscription to a different tier.
//
//   mode = "upgrade"   → apply immediately with proration, charge now,
//                        update organizations.plan_type right away.
//   mode = "downgrade" → schedule via subscription schedule so the new
//                        price kicks in at period end. proration_behavior
//                        = "none" — the user keeps the current tier
//                        until the billing period ends. plan_type is
//                        updated by the existing Stripe webhook when
//                        the cycle rolls over.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRICE_IDS: Record<string, Record<string, string | undefined>> = {
  basic: {
    monthly: Deno.env.get("STRIPE_BASIC_MONTHLY_PRICE_ID"),
    yearly: Deno.env.get("STRIPE_BASIC_YEARLY_PRICE_ID"),
  },
  pro: {
    monthly: Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID"),
    yearly: Deno.env.get("STRIPE_PRO_YEARLY_PRICE_ID"),
  },
  custom: {
    monthly: Deno.env.get("STRIPE_CUSTOM_MONTHLY_PRICE_ID"),
    yearly: Deno.env.get("STRIPE_CUSTOM_YEARLY_PRICE_ID"),
  },
};

const log = (s: string, d?: unknown) =>
  console.log(`[CHANGE-SUB-PLAN] ${s}${d ? " " + JSON.stringify(d) : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr) throw new Error(userErr.message);
    const user = userData.user;
    if (!user?.email) throw new Error("Not authenticated");

    const body = (await req.json().catch(() => ({}))) as {
      plan?: string;
      interval?: string;
      mode?: string;
      discount_code?: string;
    };
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    const mode =
      body.mode === "downgrade"
        ? "downgrade"
        : body.mode === "cancel_downgrade"
          ? "cancel_downgrade"
          : "upgrade";
    const plan = body.plan;

    // For upgrade/downgrade, plan is required. cancel_downgrade doesn't need it.
    if (mode !== "cancel_downgrade") {
      if (!plan || !["basic", "pro", "custom"].includes(plan)) {
        return new Response(JSON.stringify({ error: "Invalid plan" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const newPriceId = plan ? PRICE_IDS[plan]?.[interval] : undefined;
    if (mode !== "cancel_downgrade" && !newPriceId) {
      return new Response(
        JSON.stringify({ error: `Stripe price for ${plan} ${interval} is not configured.` }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ error: "No active subscription found." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const customerId = customers.data[0].id;

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    if (subs.data.length === 0) {
      return new Response(JSON.stringify({ error: "No active subscription found." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const subscription = subs.data[0];
    const itemId = subscription.items.data[0].id;

    // Block lifetime / grandfathered orgs from changing plan
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("organization_id, organizations(plan_type, grandfathered_lifetime, stripe_schedule_id)")
      .eq("user_id", user.id)
      .maybeSingle();

    const org = (membership as any)?.organizations;
    if (org?.plan_type === "lifetime" || org?.grandfathered_lifetime) {
      return new Response(
        JSON.stringify({ error: "Lifetime plans cannot be changed." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve discount (optional)
    let promotionCodeId: string | undefined;
    if (body.discount_code) {
      const promos = await stripe.promotionCodes.list({
        code: body.discount_code.trim(),
        active: true,
        limit: 1,
      });
      if (promos.data.length === 0) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired discount code." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      promotionCodeId = promos.data[0].id;
    }

    const orgId = (membership as any)?.organization_id;

    if (mode === "cancel_downgrade") {
      // Release the schedule so the subscription continues on its
      // current price indefinitely, and clear the org's pending fields.
      const scheduleId =
        (subscription.schedule as string | null) ||
        (org as any)?.stripe_schedule_id ||
        null;
      if (scheduleId) {
        try {
          await stripe.subscriptionSchedules.release(scheduleId);
        } catch (e) {
          console.error("[CHANGE-SUB-PLAN] release schedule failed:", e);
        }
      }
      if (orgId) {
        await supabase
          .from("organizations")
          .update({
            plan_downgrade_scheduled_to: null,
            plan_downgrade_date: null,
            stripe_schedule_id: null,
          })
          .eq("id", orgId);
      }
      log("downgrade cancelled", { scheduleId });
      return new Response(
        JSON.stringify({ success: true, mode: "cancel_downgrade" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "upgrade") {
      // Immediate switch with proration; Stripe will create + attempt to
      // pay the proration invoice automatically.
      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        ...(promotionCodeId ? { promotion_code: promotionCodeId } : {}),
        metadata: {
          ...(subscription.metadata || {}),
          plan_tier: plan!,
          plan_interval: interval,
          tidywise_plan: plan!,
        },
      });

      // Reflect new plan immediately + clear any prior pending downgrade.
      if (orgId) {
        await supabase
          .from("organizations")
          .update({
            plan_type: plan,
            plan_downgrade_scheduled_to: null,
            plan_downgrade_date: null,
            stripe_schedule_id: null,
          })
          .eq("id", orgId);
      }

      log("upgraded", { subId: updated.id, plan });
      return new Response(
        JSON.stringify({ success: true, mode: "upgrade", subscription_id: updated.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Downgrade: schedule at period end via subscription schedule ──
    let scheduleId = subscription.schedule as string | null;
    if (!scheduleId) {
      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscription.id,
      });
      scheduleId = schedule.id;
    }

    const existing = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const currentPhase = existing.phases[existing.phases.length - 1];
    const periodEndSec = currentPhase.end_date as number | null;

    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          items: currentPhase.items.map((i) => ({
            price: i.price as string,
            quantity: i.quantity,
          })),
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
        },
        {
          items: [{ price: newPriceId!, quantity: 1 }],
          iterations: 1,
          proration_behavior: "none",
          ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
          metadata: { plan_tier: plan!, plan_interval: interval, tidywise_plan: plan! },
        },
      ],
    });

    const scheduledAtIso = periodEndSec
      ? new Date(periodEndSec * 1000).toISOString()
      : null;

    // Persist the pending downgrade so the UI can show a banner and
    // offer a cancel action.
    if (orgId) {
      await supabase
        .from("organizations")
        .update({
          plan_downgrade_scheduled_to: plan,
          plan_downgrade_date: scheduledAtIso,
          stripe_schedule_id: scheduleId,
        })
        .eq("id", orgId);
    }

    log("downgrade scheduled", { scheduleId, plan, scheduledAtIso });
    return new Response(
      JSON.stringify({
        success: true,
        mode: "downgrade",
        scheduled_at: scheduledAtIso,
        target_plan: plan,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
