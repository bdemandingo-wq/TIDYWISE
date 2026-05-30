// One-time $300 lifetime checkout.
//
// Creates a Stripe Checkout Session in 'payment' mode for the lifetime
// price. Pre-checks the public counter so we don't even open checkout
// when the offer is sold out — the webhook is the final authority and
// will refund if it sees that the 50th spot was claimed mid-checkout
// by someone else, but the upfront check keeps the UX honest.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LIFETIME_PRICE_ID =
  Deno.env.get("STRIPE_LIFETIME_PRICE_ID") || "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!LIFETIME_PRICE_ID) {
      throw new Error("STRIPE_LIFETIME_PRICE_ID is not set");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: udata } = await userClient.auth.getUser(token);
    const user = udata?.user;
    if (!user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read the live counter. This is best-effort — the webhook is the
    // hard guard via the database CHECK constraint. But blocking
    // checkout here means buyers aren't surprised at the success page.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: state } = await admin
      .from("lifetime_offer_state")
      .select("total_spots, sold_spots, sold_out_at")
      .eq("id", 1)
      .maybeSingle();

    const total = state?.total_spots ?? 50;
    const sold = state?.sold_spots ?? 0;
    if (state?.sold_out_at || sold >= total) {
      return new Response(
        JSON.stringify({ error: "Lifetime offer is sold out." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Already grandfathered or already lifetime? Block — they have it.
    const { data: membership } = await admin
      .from("org_memberships")
      .select("organization_id, organizations(plan_type, grandfathered_lifetime)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    const org = (membership as any)?.organizations;
    if (org?.grandfathered_lifetime || org?.plan_type === "lifetime") {
      return new Response(
        JSON.stringify({
          error: "You already have lifetime access. No need to buy again.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin =
      req.headers.get("origin") ||
      Deno.env.get("APP_URL") ||
      "https://jointidywise.com";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: "payment",
      line_items: [{ price: LIFETIME_PRICE_ID, quantity: 1 }],
      // Request 3DS for the one-time charge so issuer-liability
      // dispute protection applies to lifetime purchases too.
      payment_method_options: {
        card: { request_three_d_secure: "automatic" },
      },
      // Metadata identifies this as a lifetime purchase for the webhook,
      // which atomically increments lifetime_offer_state.sold_spots and
      // sets the user's org plan_type to 'lifetime'.
      metadata: {
        plan: "lifetime",
        // Both keys set so the webhook can read either — `user_id` is
        // the historical name expected by the existing lifetime branch
        // in stripe-invoice-webhook; `account_id` matches the
        // fraud-evidence convention used by create-subscription.
        user_id: user.id,
        account_id: user.id,
        email: user.email,
      },
      success_url: `${origin}/checkout/success?plan=lifetime`,
      cancel_url: `${origin}/pricing?lifetime=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[buy-lifetime] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
