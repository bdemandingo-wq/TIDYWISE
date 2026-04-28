import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TIDYWISE Pro product ID
const PRO_PRODUCT_ID = "prod_Tg3zSKe9hRHLZy";

// Trial duration in days (from organization creation date)
const TRIAL_DURATION_DAYS = 60;

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("Missing Authorization header");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token || token.split(".").length !== 3) {
      logStep("Invalid auth token format");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    logStep("Authenticating user with token");

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      logStep("Authentication failed", { message: userError.message });
      return new Response(
        JSON.stringify({ error: `Authentication error: ${userError.message}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }
    const user = userData.user;
    if (!user?.email) {
      logStep("User not authenticated or email not available");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    const normalizedEmail = user.email.toLowerCase();

    // Bypass subscription check for owner accounts, Apple review, and the
    // @tidywise1.com creator domain. Keyed off the verified auth.users record
    // (NOT user-supplied input). Keep this list short.
    const FREE_ACCOUNTS = new Set([
      "support@tidywisecleaning.com",
      "applereview@tidywise.com",
      "info@openarmscleaning.com",
    ]);
    const isCreatorDomain = normalizedEmail.endsWith("@tidywise1.com");
    if (FREE_ACCOUNTS.has(normalizedEmail) || isCreatorDomain) {
      logStep("Free account detected - bypassing subscription check", { email: user.email });
      return new Response(JSON.stringify({
        subscribed: true,
        trial_active: false,
        product_id: "owner_free",
        subscription_end: null,
        trial_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── Step 0: Check for lifetime access ──────────────────────────────────
    const { data: lifetimePurchase } = await supabaseClient
      .from("lifetime_access_purchases")
      .select("id, created_at")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lifetimePurchase) {
      logStep("Lifetime access found", { email: normalizedEmail });
      return new Response(JSON.stringify({
        subscribed: true,
        trial_active: false,
        product_id: "lifetime",
        plan_type: "lifetime",
        subscription_end: null,
        trial_end: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── Step 1: Check Stripe for an active/trialing subscription first ──
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      logStep("Found Stripe customer", { customerId });

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
      });

      const activeSubscription = subscriptions.data.find(
        (sub: any) => sub.status === "active" || sub.status === "trialing"
      );

      const pastDueSubscription = subscriptions.data.find(
        (sub: any) => sub.status === "past_due"
      );

      // If past_due, block access
      if (!activeSubscription && pastDueSubscription) {
        logStep("Subscription is past_due - blocking access");
        return new Response(JSON.stringify({
          subscribed: false,
          trial_active: false,
          product_id: null,
          subscription_end: null,
          trial_end: null,
          payment_failed: true,
          message: "Your subscription payment has failed. Please update your payment method to continue."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (activeSubscription) {
        const isTrialing = activeSubscription.status === "trialing";

        let subscriptionEnd: string | null = null;
        if (activeSubscription.current_period_end && typeof activeSubscription.current_period_end === 'number') {
          try {
            subscriptionEnd = new Date(activeSubscription.current_period_end * 1000).toISOString();
          } catch (e) {
            logStep("Warning: Could not parse current_period_end", { value: activeSubscription.current_period_end });
          }
        }

        let trialEnd: string | null = null;
        if (activeSubscription.trial_end && typeof activeSubscription.trial_end === 'number') {
          try {
            trialEnd = new Date(activeSubscription.trial_end * 1000).toISOString();
          } catch (e) {
            logStep("Warning: Could not parse trial_end", { value: activeSubscription.trial_end });
          }
        }

        const productId = activeSubscription.items.data[0]?.price?.product;

        logStep("Active Stripe subscription found", {
          subscriptionId: activeSubscription.id,
          status: activeSubscription.status,
          trialEnd,
          subscriptionEnd
        });

        return new Response(JSON.stringify({
          subscribed: true,
          trial_active: isTrialing,
          product_id: productId,
          plan_type: "standard",
          subscription_end: subscriptionEnd,
          trial_end: trialEnd
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      logStep("Stripe customer exists but no active subscription");
    } else {
      logStep("No Stripe customer found");
    }

    // ── Step 2: No active Stripe subscription — check organization-based 60-day trial ──
    // Look up the user's organization via org_memberships
    const { data: membership, error: membershipError } = await supabaseClient
      .from("org_memberships")
      .select("organization_id, organizations(created_at)")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (membershipError || !membership) {
      logStep("No organization membership found for user", { userId: user.id, error: membershipError?.message });
      return new Response(JSON.stringify({
        subscribed: false,
        trial_active: false,
        product_id: null,
        subscription_end: null,
        trial_end: null,
        message: "No organization found. Please contact support."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const orgData = membership.organizations as any;
    const orgCreatedAt = orgData?.created_at;

    if (!orgCreatedAt) {
      logStep("Organization has no created_at timestamp", { orgId: membership.organization_id });
      return new Response(JSON.stringify({
        subscribed: false,
        trial_active: false,
        product_id: null,
        subscription_end: null,
        trial_end: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const orgCreatedMs = Date.parse(orgCreatedAt);
    const trialEndMs = orgCreatedMs + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const trialEndIso = new Date(trialEndMs).toISOString();
    const now = Date.now();
    const isWithinTrial = now < trialEndMs;

    logStep("Organization trial check", {
      orgId: membership.organization_id,
      orgCreatedAt,
      trialEndIso,
      isWithinTrial,
      daysRemaining: isWithinTrial ? Math.ceil((trialEndMs - now) / (1000 * 60 * 60 * 24)) : 0,
    });

    // Orgs created on or after 2026-04-06 do NOT get a free auto-trial.
    // They must subscribe (pay) to get full access.
    const TRIAL_CUTOFF_DATE = "2026-04-06T00:00:00Z";
    const orgCreatedAfterCutoff = orgCreatedAt >= TRIAL_CUTOFF_DATE;

    if (isWithinTrial && !orgCreatedAfterCutoff) {
      return new Response(JSON.stringify({
        subscribed: true,
        trial_active: true,
        product_id: "org_trial",
        subscription_end: null,
        trial_end: trialEndIso,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Trial has ended — must subscribe
    return new Response(JSON.stringify({
      subscribed: false,
      trial_active: false,
      product_id: null,
      subscription_end: null,
      trial_end: trialEndIso,
      message: "Your 60-day free trial has ended. Please subscribe to continue.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
