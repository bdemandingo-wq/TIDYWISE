import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// TIDYWISE Standard plan price ID - $97/month
const PRICE_ID = Deno.env.get("STRIPE_STANDARD_PRICE_ID") || "price_1SihrVJv857o86noT8NIIfrq";

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

    // Optional client-supplied fraud-evidence fields
    let bodyData: any = {};
    try { bodyData = await req.json(); } catch { /* no body */ }
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      bodyData?.ip || null;
    const userAgent = bodyData?.userAgent || req.headers.get("user-agent") || null;
    const deviceFingerprint = bodyData?.deviceFingerprint || null;

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

    // Fraud-evidence metadata travels with every charge in Stripe
    const evidenceMetadata: Record<string, string> = {
      account_id: user.id,
      email: user.email,
      signup_date: user.created_at || new Date().toISOString(),
      ip: clientIp || "",
      device: (userAgent || "").slice(0, 480),
      device_fingerprint: deviceFingerprint || "",
      purpose: "tidywise_saas_subscription",
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
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
        // Carry 3DS request to recurring renewal invoices. Without this,
        // only the initial Checkout charge would request authentication;
        // monthly renewals would skip the issuer auth step.
        payment_settings: {
          payment_method_options: {
            card: { request_three_d_secure: "automatic" },
          },
        },
      },
      payment_intent_data: undefined, // not allowed in subscription mode
      success_url: `${origin}/dashboard?subscription=success`,
      cancel_url: `${origin}/dashboard/subscription?canceled=true`,
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
