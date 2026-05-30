import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Returns assembled dispute evidence for a given Stripe PaymentIntent.
 *
 * Designed for Visa Compelling Evidence 3.0 (reason code 10.4):
 *  - Disputed charge details
 *  - 2+ matching prior undisputed charges from the same customer
 *    (matching elements: email, IP, device, account_id)
 *  - Signup date
 *  - ToS acceptance record
 *
 * Caller must be an authenticated platform admin.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: udata } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!udata.user) throw new Error("Not authenticated");

    const { stripe_payment_intent_id } = await req.json();
    if (!stripe_payment_intent_id) throw new Error("stripe_payment_intent_id required");

    // Disputed charge evidence row
    const { data: disputed } = await supabase
      .from("payment_evidence")
      .select("*")
      .eq("stripe_payment_intent_id", stripe_payment_intent_id)
      .maybeSingle();

    if (!disputed) {
      return new Response(
        JSON.stringify({ error: "No evidence found for this payment intent" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prior undisputed charges from same customer (same email/IP/device/account)
    const { data: priors } = await supabase
      .from("payment_evidence")
      .select("*")
      .eq("stripe_customer_id", disputed.stripe_customer_id)
      .neq("stripe_payment_intent_id", stripe_payment_intent_id)
      .order("created_at", { ascending: false })
      .limit(25);

    const matchingPriors = (priors || []).filter((p) => {
      let matches = 0;
      if (p.email && p.email === disputed.email) matches++;
      if (p.ip_address && p.ip_address === disputed.ip_address) matches++;
      if (p.user_agent && p.user_agent === disputed.user_agent) matches++;
      if (p.user_id && p.user_id === disputed.user_id) matches++;
      return matches >= 2;
    });

    // ToS acceptance
    let tos = null;
    if (disputed.user_id) {
      const { data: tosRow } = await supabase
        .from("tos_acceptances")
        .select("accepted, tos_version, accepted_at, ip_address, user_agent")
        .eq("user_id", disputed.user_id)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      tos = tosRow;
    }

    // Recent access/usage signals: latest profile activity
    let access = null;
    if (disputed.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email, created_at, last_active_at")
        .eq("id", disputed.user_id)
        .maybeSingle();
      access = profile;
    }

    const evidence = {
      disputed_charge: disputed,
      matching_prior_transactions: matchingPriors,
      matching_count: matchingPriors.length,
      ce30_eligible: matchingPriors.length >= 2,
      tos_acceptance: tos,
      account_access: access,
      summary_for_stripe: [
        `Cardholder authenticated via TidyWise account ${disputed.email}.`,
        `Account created ${disputed.signup_date}.`,
        tos?.accepted
          ? `Accepted Terms of Service v${tos.tos_version} on ${tos.accepted_at} from IP ${tos.ip_address}.`
          : null,
        disputed.three_d_secure_status
          ? `3D Secure result on disputed charge: ${disputed.three_d_secure_status}.`
          : null,
        matchingPriors.length >= 2
          ? `${matchingPriors.length} prior undisputed charges on the same account sharing 2+ matching elements (email, IP, device, account id).`
          : null,
      ].filter(Boolean).join(" "),
    };

    return new Response(JSON.stringify(evidence), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
