import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const stripeClientId = Deno.env.get("STRIPE_CLIENT_ID") || "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

    if (!stripeClientId || !stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe Connect not configured on platform" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { action, organization_id, code, state } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Generate OAuth URL
    if (action === "get_oauth_url") {
      const redirectUri = "https://jointidywise.com/dashboard/payment-integration";
      const { email } = await req.json().catch(() => ({})) || {};
      
      const params = new URLSearchParams({
        response_type: "code",
        client_id: stripeClientId,
        scope: "read_write",
        redirect_uri: redirectUri,
        state: organization_id,
        "stripe_user[business_type]": "company",
        always_show_login: "true",
      });

      if (email) {
        params.set("stripe_user[email]", email);
      }

      const oauthUrl = `https://connect.stripe.com/oauth/v2/authorize?${params.toString()}`;

      return new Response(
        JSON.stringify({ url: oauthUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Exchange authorization code for access token
    if (action === "exchange_code") {
      if (!code) {
        return new Response(
          JSON.stringify({ error: "Authorization code is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Exchange the code with Stripe
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      const response = await stripe.oauth.token({
        grant_type: "authorization_code",
        code,
      });

      if (!response.stripe_user_id) {
        return new Response(
          JSON.stringify({ error: "Failed to get Stripe account ID" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch account details
      const account = await stripe.accounts.retrieve(response.stripe_user_id);

      // Store in database
      const { error: upsertError } = await supabase
        .from("org_stripe_settings")
        .upsert({
          organization_id,
          stripe_account_id: response.stripe_user_id,
          stripe_access_token: response.access_token,
          stripe_refresh_token: response.refresh_token,
          stripe_publishable_key: response.stripe_publishable_key || null,
          stripe_secret_key: response.access_token || "", // Use access token as the secret key for API calls
          stripe_user_email: account.email || null,
          stripe_display_name: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
          stripe_payouts_enabled: account.payouts_enabled || false,
          stripe_default_currency: account.default_currency || "usd",
          is_connected: true,
          connected_at: new Date().toISOString(),
        }, {
          onConflict: "organization_id",
        });

      if (upsertError) {
        console.error("[stripe-connect-oauth] Upsert error:", upsertError);
        return new Response(
          JSON.stringify({ error: "Failed to save connection" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          account_id: response.stripe_user_id,
          email: account.email,
          display_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
          payouts_enabled: account.payouts_enabled,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Get connection status with account details
    if (action === "get_status") {
      const { data, error } = await supabase
        .from("org_stripe_settings")
        .select("is_connected, connected_at, stripe_account_id, stripe_user_email, stripe_display_name, stripe_payouts_enabled, stripe_default_currency, stripe_publishable_key, stripe_secret_key, stripe_access_token")
        .eq("organization_id", organization_id)
        .maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch status" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if connected via OAuth OR via legacy manual API keys
      const isConnectedViaOAuth = data?.is_connected && data?.stripe_account_id;
      const isConnectedViaManualKeys = !data?.is_connected && data?.stripe_secret_key && !data?.stripe_account_id;

      // If they have manual keys but no OAuth connection, mark as connected (legacy)
      if (isConnectedViaManualKeys) {
        return new Response(
          JSON.stringify({
            connected: true,
            legacy: true,
            email: data.stripe_user_email || null,
            display_name: data.stripe_display_name || null,
            payouts_enabled: data.stripe_payouts_enabled ?? true,
            connected_at: data.connected_at || null,
            default_currency: data.stripe_default_currency || "usd",
            has_publishable_key: !!data.stripe_publishable_key,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (isConnectedViaOAuth) {
        try {
          // Get the org's access token to make API calls
          const { data: fullSettings } = await supabase
            .from("org_stripe_settings")
            .select("stripe_access_token, stripe_secret_key")
            .eq("organization_id", organization_id)
            .single();

          const apiKey = fullSettings?.stripe_access_token || fullSettings?.stripe_secret_key;
          if (apiKey) {
            const stripe = new Stripe(apiKey, { apiVersion: "2023-10-16" });
            const account = await stripe.accounts.retrieve(data.stripe_account_id);

            // Update cached info
            await supabase
              .from("org_stripe_settings")
              .update({
                stripe_payouts_enabled: account.payouts_enabled,
                stripe_user_email: account.email,
                stripe_display_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
              })
              .eq("organization_id", organization_id);

            return new Response(
              JSON.stringify({
                connected: true,
                account_id: data.stripe_account_id,
                email: account.email,
                display_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
                payouts_enabled: account.payouts_enabled,
                connected_at: data.connected_at,
                default_currency: account.default_currency || data.stripe_default_currency,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } catch (e) {
          console.warn("[stripe-connect-oauth] Could not refresh account details:", e);
        }

        // Return cached data if live fetch fails
        return new Response(
          JSON.stringify({
            connected: true,
            account_id: data.stripe_account_id,
            email: data.stripe_user_email,
            display_name: data.stripe_display_name,
            payouts_enabled: data.stripe_payouts_enabled,
            connected_at: data.connected_at,
            default_currency: data.stripe_default_currency,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ connected: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: Disconnect
    if (action === "disconnect") {
      // Get account ID first
      const { data: settings } = await supabase
        .from("org_stripe_settings")
        .select("stripe_account_id")
        .eq("organization_id", organization_id)
        .single();

      if (settings?.stripe_account_id) {
        try {
          const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
          await stripe.oauth.deauthorize({
            client_id: stripeClientId,
            stripe_user_id: settings.stripe_account_id,
          });
        } catch (e) {
          console.warn("[stripe-connect-oauth] Deauthorize failed:", e);
        }
      }

      const { error } = await supabase
        .from("org_stripe_settings")
        .delete()
        .eq("organization_id", organization_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to disconnect" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[stripe-connect-oauth] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
