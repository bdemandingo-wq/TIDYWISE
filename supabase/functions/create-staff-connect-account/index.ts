import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Authenticate the user
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

    const { staffId, organizationId, returnUrl } = await req.json();

    if (!staffId || !organizationId) {
      return new Response(JSON.stringify({ error: "staffId and organizationId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify staff belongs to this user
    const { data: staffRecord, error: staffError } = await supabase
      .from("staff")
      .select("id, name, email, user_id, organization_id")
      .eq("id", staffId)
      .eq("user_id", userData.user.id)
      .single();

    if (staffError || !staffRecord) {
      return new Response(JSON.stringify({ error: "Staff record not found or access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org matches
    if (staffRecord.organization_id !== organizationId) {
      return new Response(JSON.stringify({ error: "Organization mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org Stripe client
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      return new Response(JSON.stringify({ error: stripeResult.error || "Stripe not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = stripeResult.stripe;

    // Check if account already exists
    const { data: existingAccount } = await supabase
      .from("staff_payout_accounts")
      .select("*")
      .eq("staff_id", staffId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    let stripeAccountId = existingAccount?.stripe_account_id;

    if (!stripeAccountId) {
      // Create a new Stripe Connect Express account
      const account = await stripe.accounts.create({
        type: "express",
        email: staffRecord.email,
        metadata: {
          staff_id: staffId,
          organization_id: organizationId,
        },
        capabilities: {
          transfers: { requested: true },
        },
      });

      stripeAccountId = account.id;

      // Save to database
      await supabase.from("staff_payout_accounts").upsert({
        staff_id: staffId,
        organization_id: organizationId,
        stripe_account_id: stripeAccountId,
        account_status: "onboarding",
        account_holder_name: staffRecord.name,
      }, { onConflict: "staff_id,organization_id" });
    }

    // Create an account link for onboarding
    const baseReturnUrl = returnUrl || req.headers.get("origin") || "https://jointidywise.lovable.app";

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${baseReturnUrl}/staff?tab=payouts`,
      return_url: `${baseReturnUrl}/staff?tab=payouts&setup=complete`,
      type: "account_onboarding",
    });

    // Update onboarding URL
    await supabase
      .from("staff_payout_accounts")
      .update({ onboarding_url: accountLink.url, updated_at: new Date().toISOString() })
      .eq("staff_id", staffId)
      .eq("organization_id", organizationId);

    return new Response(JSON.stringify({
      url: accountLink.url,
      accountId: stripeAccountId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating Connect account:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
