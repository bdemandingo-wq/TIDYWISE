// Stripe subscription webhook — keeps organizations.plan_tier in sync.
// Listens for customer.subscription.created / updated / deleted, resolves the
// customer email -> owner user -> organization, and updates plan_tier based on
// the active subscription's price id. Cancelled/deleted -> 'trial' (unless the
// org is lifetime/grandfathered).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { subscriptionToPlanTier, updateOrgPlanTier, PlanTier } from "../_shared/plan-tier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const log = (step: string, details?: unknown) => {
  const s = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-SUB-WEBHOOK] ${step}${s}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe env not configured" }), { status: 500, headers: corsHeaders });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let event: Stripe.Event;
  try {
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new Error("missing signature");
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    log("Invalid signature", { message: (err as Error).message });
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 400, headers: corsHeaders });
  }

  try {
    if (
      event.type !== "customer.subscription.created" &&
      event.type !== "customer.subscription.updated" &&
      event.type !== "customer.subscription.deleted"
    ) {
      return new Response(JSON.stringify({ ignored: event.type }), { status: 200, headers: corsHeaders });
    }

    const sub = event.data.object as Stripe.Subscription;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customerId) throw new Error("no customer id");

    const customer = await stripe.customers.retrieve(customerId);
    const email = (customer as any)?.email?.toLowerCase();
    if (!email) throw new Error("customer has no email");

    // Find org via owner/admin membership -> profiles.email
    const { data: profile } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!profile) {
      log("No profile matches customer email", { email });
      return new Response(JSON.stringify({ ok: true, skipped: "no_profile" }), { status: 200, headers: corsHeaders });
    }
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("organization_id")
      .eq("user_id", profile.id)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    if (!membership) {
      log("No owning org", { email });
      return new Response(JSON.stringify({ ok: true, skipped: "no_org" }), { status: 200, headers: corsHeaders });
    }

    // Decide tier: if this event is delete or the subscription is not active/trialing,
    // check if the customer still has ANY other active/trialing sub. Otherwise -> trial.
    let tier: PlanTier = "trial";
    const isTerminal =
      event.type === "customer.subscription.deleted" ||
      !(sub.status === "active" || sub.status === "trialing");

    if (isTerminal) {
      const all = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
      const other = all.data.find(
        (s) => s.id !== sub.id && (s.status === "active" || s.status === "trialing"),
      );
      if (other) tier = subscriptionToPlanTier(other) ?? "trial";
    } else {
      tier = subscriptionToPlanTier(sub) ?? "trial";
    }

    const result = await updateOrgPlanTier(supabase, membership.organization_id, tier);
    log("Updated plan_tier", { orgId: membership.organization_id, tier, ...result });

    return new Response(JSON.stringify({ ok: true, tier, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log("ERROR", { message: (err as Error).message });
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
