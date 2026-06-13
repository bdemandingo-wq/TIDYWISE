// Tier-aware subscription checkout. Supports two flows:
//
//   1) Anonymous (checkout-first):
//      - Caller is NOT authenticated. Stripe Checkout collects the email
//        and creates a Customer. The completed-session webhook reads
//        customer_details.email and provisions the TidyWise account
//        from there.
//      - This is the default /pricing flow: visitor clicks "Start Pro",
//        goes straight to Stripe, pays, and lands on /welcome where
//        the webhook (already running) has emailed them a link to set
//        their password.
//
//   2) Authenticated (in-app upgrade):
//      - Caller is logged in (Bearer token present). We look up their
//        existing Stripe customer + check for grandfathered-lifetime
//        before opening Checkout. Used when a logged-in Basic user
//        clicks /pricing → "Choose Pro" to upgrade their plan.
//
// The function distinguishes via the presence/validity of the Bearer
// token. verify_jwt = false in config.toml so anonymous callers reach
// us; the function still gates the authenticated branch via getUser().

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    let bodyData: Record<string, unknown> = {};
    try {
      bodyData = (await req.json()) as Record<string, unknown>;
    } catch {
      // no body
    }

    const requestedPlan =
      typeof bodyData?.plan === "string" ? (bodyData.plan as string) : undefined;
    const requestedInterval =
      bodyData?.interval === "yearly" ? "yearly" : "monthly";

    if (!requestedPlan || !["basic", "pro", "custom"].includes(requestedPlan)) {
      return new Response(
        JSON.stringify({ error: "Invalid plan — must be basic, pro, or custom." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Fail fast if the price ID for the chosen tier isn't configured.
    // Better than silently falling back to a legacy price (which was
    // billing $50 "Pro Subscription" when Basic was clicked).
    const priceId = PRICE_IDS[requestedPlan]?.[requestedInterval];
    if (!priceId) {
      logStep("Missing price ID config", {
        plan: requestedPlan,
        interval: requestedInterval,
      });
      return new Response(
        JSON.stringify({
          error: `Stripe price for ${requestedPlan} ${requestedInterval} is not configured on the server yet. The operator needs to set STRIPE_${requestedPlan.toUpperCase()}_${requestedInterval.toUpperCase()}_PRICE_ID in Supabase secrets.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 },
      );
    }

    // ── Detect flow: anonymous vs authenticated ───────────────────────────
    const authHeader = req.headers.get("Authorization");
    let user: { id: string; email: string; created_at?: string } | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      // Skip the supabase auth gateway's anon-key fingerprint that some
      // clients send by default — that's not a real session token.
      const isAnonKey = token === (Deno.env.get("SUPABASE_ANON_KEY") ?? "");
      if (!isAnonKey) {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        );
        const { data } = await supabaseClient.auth.getUser(token);
        if (data.user?.email) {
          user = {
            id: data.user.id,
            email: data.user.email,
            created_at: data.user.created_at,
          };
          logStep("Authenticated flow", { userId: user.id, email: user.email });
        } else {
          // Bearer present but didn't resolve to a user (expired session,
          // revoked token, or a stale JWT auto-attached by supabase-js
          // from a previous session on the public pricing page). Don't
          // 401 — that breaks anonymous checkout for visitors who just
          // happen to have an old token in localStorage. Fall through to
          // the anonymous flow; Stripe will collect their email at
          // checkout and we link it to an account afterward.
          logStep("Bearer present but invalid — continuing as anonymous");
        }
      } else {
        logStep("Anonymous flow (anon-key Bearer ignored)");
      }
    } else {
      logStep("Anonymous flow (no Bearer header)");
    }

    let customerId: string | undefined;
    if (user) {
      const accessAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      );
      const { data: existingOrg } = await accessAdmin
        .from("org_memberships")
        .select("organizations(plan_type, grandfathered_lifetime)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      const org = (existingOrg as { organizations?: { plan_type?: string; grandfathered_lifetime?: boolean } } | null)?.organizations;
      if (org?.grandfathered_lifetime || org?.plan_type === "lifetime") {
        return new Response(
          JSON.stringify({
            error: "You already have lifetime access — no need to subscribe.",
            alreadyLifetime: true,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const stripeForLookup = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const customers = await stripeForLookup.customers.list({
        email: user.email,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { customerId });

        const existingSubs = await stripeForLookup.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });
        if (existingSubs.data.length > 0) {
          return new Response(
            JSON.stringify({ error: "You already have an active subscription." }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }
      }
    }

    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = req.headers.get("user-agent") || null;
    const deviceFingerprint =
      typeof bodyData?.deviceFingerprint === "string"
        ? (bodyData.deviceFingerprint as string)
        : null;

    const evidenceMetadata: Record<string, string> = {
      ip: clientIp || "",
      device: (userAgent || "").slice(0, 480),
      device_fingerprint: deviceFingerprint || "",
      purpose: "tidywise_saas_subscription",
      tidywise_plan: requestedPlan,
      tidywise_interval: requestedInterval,
      signup_flow: user ? "in_app_upgrade" : "anonymous_checkout",
    };
    if (user) {
      evidenceMetadata.account_id = user.id;
      evidenceMetadata.email = user.email;
      evidenceMetadata.signup_date = user.created_at || new Date().toISOString();
    }

    const origin =
      req.headers.get("origin") ||
      Deno.env.get("APP_URL") ||
      "https://jointidywise.com";
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // 7-day free trial on every new subscription. Card is collected
    // upfront at Stripe Checkout (default in subscription mode) and
    // billing automatically starts at $X/mo once the trial ends. If
    // the saved card later fails or is removed before trial end, the
    // subscription is cancelled instead of going unpaid.
    // Redeploy marker 2026-06-13: ensure trial is live (checkout was
    // charging $49 immediately because the deployed function was stale).
    const TRIAL_DAYS = 7;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user?.email,
      // Note: `customer_creation` is only valid in payment mode. In
      // subscription mode Stripe always creates a Customer automatically,
      // so we don't need (or are allowed) to set it.

      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      // Force card collection even during the trial so the customer
      // is auto-charged when the 7 days end.
      payment_method_collection: "always",
      payment_method_options: {
        card: { request_three_d_secure: "automatic" },
      },
      metadata: evidenceMetadata,
      subscription_data: {
        metadata: evidenceMetadata,
        trial_period_days: TRIAL_DAYS,
        trial_settings: {
          end_behavior: { missing_payment_method: "cancel" },
        },
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${requestedPlan}&interval=${requestedInterval}`,
      cancel_url: `${origin}/pricing?canceled=true`,
    });

    logStep("Checkout session created", {
      sessionId: session.id,
      flow: user ? "authenticated" : "anonymous",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
