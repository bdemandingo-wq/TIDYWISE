import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, stripe-signature",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const platformStripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");

    if (!supabaseUrl || !serviceRoleKey || !platformStripeKey) {
      console.error("[stripe-connect-webhook] Missing environment variables");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.text();
    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) {
        console.error("[stripe-connect-webhook] Missing stripe-signature header");
        return new Response(JSON.stringify({ error: "Missing signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const stripe = new Stripe(platformStripeKey, { apiVersion: "2025-08-27.basil" });
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err: any) {
        console.error("[stripe-connect-webhook] Signature verification failed:", err.message);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // No webhook secret configured — parse directly (log warning)
      console.warn("[stripe-connect-webhook] No STRIPE_CONNECT_WEBHOOK_SECRET configured, skipping signature verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log("[stripe-connect-webhook] Received event:", event.type, "for account:", (event.data.object as any)?.id || "unknown");

    // Only handle account.updated events
    if (event.type !== "account.updated") {
      console.log("[stripe-connect-webhook] Ignoring event type:", event.type);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const account = event.data.object as Stripe.Account;
    const stripeAccountId = account.id;

    console.log("[stripe-connect-webhook] Processing account.updated for:", stripeAccountId, {
      payouts_enabled: account.payouts_enabled,
      charges_enabled: account.charges_enabled,
      details_submitted: account.details_submitted,
      requirements_currently_due: account.requirements?.currently_due,
      requirements_pending: account.requirements?.pending_verification,
      disabled_reason: account.requirements?.disabled_reason,
    });

    // Find the matching staff_payout_accounts record
    const { data: payoutAccount, error: lookupError } = await supabase
      .from("staff_payout_accounts")
      .select("id, staff_id, organization_id")
      .eq("stripe_account_id", stripeAccountId)
      .maybeSingle();

    if (lookupError) {
      console.error("[stripe-connect-webhook] DB lookup error:", lookupError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payoutAccount) {
      console.log("[stripe-connect-webhook] No matching staff_payout_accounts for Stripe account:", stripeAccountId);
      return new Response(JSON.stringify({ received: true, matched: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine status
    const newStatus = account.details_submitted
      ? (account.payouts_enabled ? "active" : "pending_verification")
      : "onboarding";

    // Extract bank info
    let bankLast4: string | null = null;
    if (account.external_accounts?.data?.length && account.external_accounts.data.length > 0) {
      const bankAccount = account.external_accounts.data[0];
      bankLast4 = (bankAccount as any).last4 || null;
    }

    // Build update payload
    const updatePayload: Record<string, any> = {
      account_status: newStatus,
      payouts_enabled: account.payouts_enabled || false,
      charges_enabled: account.charges_enabled || false,
      details_submitted: account.details_submitted || false,
      bank_last4: bankLast4,
      last_webhook_at: new Date().toISOString(),
      requirements_currently_due: account.requirements?.currently_due || [],
      requirements_pending_verification: account.requirements?.pending_verification || [],
      disabled_reason: account.requirements?.disabled_reason || null,
      stripe_requirements_errors: account.requirements?.errors || [],
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("staff_payout_accounts")
      .update(updatePayload)
      .eq("id", payoutAccount.id);

    if (updateError) {
      console.error("[stripe-connect-webhook] Failed to update staff_payout_accounts:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[stripe-connect-webhook] Updated staff", payoutAccount.staff_id, "to status:", newStatus);

    return new Response(JSON.stringify({ received: true, matched: true, status: newStatus }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[stripe-connect-webhook] Unhandled error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
