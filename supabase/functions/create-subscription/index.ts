import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// TIDYWISE Standard plan price ID - $97/month (legacy single-tier fallback;
// used when the body doesn't specify plan+interval, e.g. older clients
// pre-launch).
const LEGACY_PRICE_ID =
  Deno.env.get("STRIPE_STANDARD_PRICE_ID") || "price_1SihrVJv857o86noT8NIIfrq";

// Tier-aware price ID lookup. Each tier has a monthly and a yearly
// Stripe Price; the env-var names are what the operator pastes into
// Supabase Edge Function secrets after creating the prices in Stripe
// Dashboard. Missing values fall back to the legacy price so a
// half-configured deploy doesn't 500.
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

function resolvePriceId(plan: string | undefined, interval: string | undefined): string {
  if (!plan) return LEGACY_PRICE_ID;
  const resolved = PRICE_IDS[plan]?.[interval ?? "monthly"];
  if (!resolved) {
    console.warn(
      `[CREATE-SUBSCRIPTION] No price ID configured for ${plan}/${interval}, falling back to LEGACY_PRICE_ID`,
    );
    return LEGACY_PRICE_ID;
  }
  return resolved;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Refuse if the caller already has lifetime access (paid OR
    // grandfathered). Without this guard, an existing-customer mis-click
    // on /pricing would charge them on top of their free forever access.
    // We resolve their org via service-role since the user-scoped client
    // here is the legacy single-tier client (anon key only).
    const accessAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    const { data: existingOrg } = await accessAdmin
      .from("org_memberships")
      .select("organizations(plan_type, grandfathered_lifetime)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const org = (existingOrg as any)?.organizations;
    if (org?.grandfathered_lifetime || org?.plan_type === "lifetime") {
      return new Response(
        JSON.stringify({
          error: "You already have lifetime access — no need to subscribe.",
          alreadyLifetime: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional client-supplied fraud-evidence fields. NOTE: ip and userAgent
    // MUST come from request headers, not from the body — anything the
    // client controls can be spoofed, and the dispute path at
    // stripe-invoice-webhook later treats matching ip / user_agent on
    // prior charges as "same user" evidence under Visa CE 3.0. A
    // fraudster who can set their own ip header could mimic a legitimate
    // returning customer and qualify their charge as CE-eligible — the
    // exact attack the fraud stack was built to prevent. deviceFingerprint
    // stays client-supplied because it has no equivalent header and is
    // used only as a soft signal; the strong signals (ip, ua, email,
    // account_id) all derive from the server.
    let bodyData: any = {};
    try { bodyData = await req.json(); } catch { /* no body */ }
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = req.headers.get("user-agent") || null;
    const deviceFingerprint = bodyData?.deviceFingerprint || null;

    // Tier + interval (e.g. plan="pro", interval="yearly"). When absent
    // we fall back to the legacy single-tier price.
    const requestedPlan: string | undefined = bodyData?.plan;
    const requestedInterval: string | undefined = bodyData?.interval;
    if (requestedPlan && !["basic", "pro", "custom"].includes(requestedPlan)) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (requestedInterval && !["monthly", "yearly"].includes(requestedInterval)) {
      return new Response(JSON.stringify({ error: "Invalid interval" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const priceId = resolvePriceId(requestedPlan, requestedInterval);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });

      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });
      if (existingSubs.data.length > 0) {
        return new Response(JSON.stringify({ error: "You already have an active subscription." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
    }

    const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://jointidywise.com";

    // Fraud-evidence metadata travels with every charge in Stripe.
    // Includes plan + interval so the webhook + downstream reporting
    // can tell which tier this charge belongs to.
    const evidenceMetadata: Record<string, string> = {
      account_id: user.id,
      email: user.email,
      signup_date: user.created_at || new Date().toISOString(),
      ip: clientIp || "",
      device: (userAgent || "").slice(0, 480),
      device_fingerprint: deviceFingerprint || "",
      purpose: "tidywise_saas_subscription",
      tidywise_plan: requestedPlan ?? "legacy",
      tidywise_interval: requestedInterval ?? "monthly",
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      // Request 3D Secure on the initial checkout charge when the issuer
      // supports it — shifts fraud liability to the issuer for Visa
      // reason code 10.4 chargebacks (free alternative to Adaptive 3DS).
      payment_method_options: {
        card: { request_three_d_secure: "automatic" },
      },
      // Metadata on the Checkout Session, the Subscription, and every
      // generated Invoice / PaymentIntent — so evidence stays with the charge.
      metadata: evidenceMetadata,
      subscription_data: {
        metadata: evidenceMetadata,
        // Note: Checkout Sessions don't accept subscription_data.payment_settings.
        // 3DS on renewal invoices is enforced via Stripe Radar rules / the
        // payment method's stored authentication; the initial charge above
        // already requests 3DS, which shifts liability for the saved card.
      },
      payment_intent_data: undefined, // not allowed in subscription mode
      success_url: `${origin}/checkout/success?plan=${encodeURIComponent(requestedPlan ?? '')}&interval=${encodeURIComponent(requestedInterval ?? 'monthly')}`,
      cancel_url: `${origin}/pricing`,
    });

    logStep("Checkout session created", { sessionId: session.id });

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
