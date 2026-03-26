import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { staffId, organizationId } = await req.json();

    if (!staffId || !organizationId) {
      return new Response(JSON.stringify({ error: "staffId and organizationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing payout account record
    const { data: payoutAccount } = await supabase
      .from("staff_payout_accounts")
      .select("*")
      .eq("staff_id", staffId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!payoutAccount?.stripe_account_id) {
      return new Response(JSON.stringify({
        status: "not_started",
        payoutsEnabled: false,
        detailsSubmitted: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch latest status from Stripe
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      return new Response(JSON.stringify({ error: stripeResult.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const account = await stripeResult.stripe.accounts.retrieve(payoutAccount.stripe_account_id);

    const newStatus = account.details_submitted
      ? (account.payouts_enabled ? "active" : "pending_verification")
      : "onboarding";

    // Get bank info if available
    let bankLast4: string | null = null;
    if (account.external_accounts?.data?.length > 0) {
      const bankAccount = account.external_accounts.data[0];
      bankLast4 = bankAccount.last4 || null;
    }

    // Update local record
    await supabase
      .from("staff_payout_accounts")
      .update({
        account_status: newStatus,
        payouts_enabled: account.payouts_enabled || false,
        charges_enabled: account.charges_enabled || false,
        details_submitted: account.details_submitted || false,
        bank_last4: bankLast4,
        updated_at: new Date().toISOString(),
      })
      .eq("staff_id", staffId)
      .eq("organization_id", organizationId);

    return new Response(JSON.stringify({
      status: newStatus,
      payoutsEnabled: account.payouts_enabled || false,
      chargesEnabled: account.charges_enabled || false,
      detailsSubmitted: account.details_submitted || false,
      bankLast4: bankLast4,
      accountHolderName: payoutAccount.account_holder_name,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error checking payout status:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
