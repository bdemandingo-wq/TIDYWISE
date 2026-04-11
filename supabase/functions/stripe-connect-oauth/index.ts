import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import {
  createForbiddenResponse,
  createUnauthorizedResponse,
  verifyAdminAuth,
} from "../_shared/verify-admin-auth.ts";

const STRIPE_API_VERSION = "2025-08-27.basil";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const extractStripeErrorMessage = (error: unknown) => {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    const maybeMessage = (error as { raw?: { message?: string }; message?: string }).raw?.message
      || (error as { message?: string }).message;
    return maybeMessage || JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const stripeClientId = Deno.env.get("STRIPE_CLIENT_ID") || "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "Backend configuration missing" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { action, organization_id, code, email, secret_key, publishable_key } = body ?? {};

    if (!organization_id) {
      return jsonResponse({ error: "organization_id is required" }, 400);
    }

    const authResult = await verifyAdminAuth(req.headers.get("Authorization"), {
      requireAdmin: true,
      requireOrganizationId: organization_id,
    });

    if (!authResult.success) {
      if (authResult.error === "Invalid or expired token" || authResult.error === "Missing authorization header") {
        return createUnauthorizedResponse(authResult.error, corsHeaders);
      }
      return createForbiddenResponse(authResult.error || "Access denied", corsHeaders);
    }

    if (action === "get_oauth_url") {
      if (!stripeClientId || !stripeSecretKey) {
        return jsonResponse({ error: "Stripe Connect not configured on platform" }, 500);
      }

      const redirectUri = "https://jointidywise.com/dashboard/payment-integration";
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

      const oauthUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
      return jsonResponse({ url: oauthUrl });
    }

    if (action === "exchange_code") {
      if (!stripeClientId || !stripeSecretKey) {
        return jsonResponse({ error: "Stripe Connect not configured on platform" }, 500);
      }

      if (!code) {
        return jsonResponse({ error: "Authorization code is required" }, 400);
      }

      const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
      const response = await stripe.oauth.token({
        grant_type: "authorization_code",
        code,
      });

      if (!response.stripe_user_id) {
        return jsonResponse({ error: "Failed to get Stripe account ID" }, 400);
      }

      const account = await stripe.accounts.retrieve(response.stripe_user_id);

      const { error: upsertError } = await supabase
        .from("org_stripe_settings")
        .upsert({
          organization_id,
          stripe_account_id: response.stripe_user_id,
          stripe_access_token: response.access_token,
          stripe_refresh_token: response.refresh_token,
          stripe_publishable_key: response.stripe_publishable_key || null,
          stripe_secret_key: response.access_token || "",
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
        return jsonResponse({ error: "Failed to save connection" }, 500);
      }

      return jsonResponse({
        success: true,
        account_id: response.stripe_user_id,
        email: account.email,
        display_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
        payouts_enabled: account.payouts_enabled,
      });
    }

    if (action === "get_status") {
      const { data, error } = await supabase
        .from("org_stripe_settings")
        .select("is_connected, connected_at, stripe_account_id, stripe_user_email, stripe_display_name, stripe_payouts_enabled, stripe_default_currency, stripe_publishable_key, stripe_secret_key, stripe_access_token")
        .eq("organization_id", organization_id)
        .maybeSingle();

      if (error) {
        return jsonResponse({ error: "Failed to fetch status" }, 500);
      }

      const isConnectedViaOAuth = !!(data?.is_connected && data?.stripe_account_id);
      const isConnectedViaManualKeys = !!(data?.stripe_secret_key && !data?.stripe_account_id);

      if (isConnectedViaManualKeys) {
        return jsonResponse({
          connected: true,
          legacy: true,
          email: data?.stripe_user_email || null,
          display_name: data?.stripe_display_name || null,
          payouts_enabled: data?.stripe_payouts_enabled ?? true,
          connected_at: data?.connected_at || null,
          default_currency: data?.stripe_default_currency || "usd",
          has_publishable_key: !!data?.stripe_publishable_key,
        });
      }

      if (isConnectedViaOAuth && data?.stripe_account_id) {
        try {
          const apiKey = data.stripe_access_token || data.stripe_secret_key;
          if (apiKey) {
            const stripe = new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION });
            const account = await stripe.accounts.retrieve(data.stripe_account_id);

            await supabase
              .from("org_stripe_settings")
              .update({
                stripe_payouts_enabled: account.payouts_enabled,
                stripe_user_email: account.email,
                stripe_display_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
              })
              .eq("organization_id", organization_id);

            return jsonResponse({
              connected: true,
              account_id: data.stripe_account_id,
              email: account.email,
              display_name: account.business_profile?.name || account.settings?.dashboard?.display_name,
              payouts_enabled: account.payouts_enabled,
              connected_at: data.connected_at,
              default_currency: account.default_currency || data.stripe_default_currency,
            });
          }
        } catch (refreshError) {
          console.warn("[stripe-connect-oauth] Could not refresh account details:", refreshError);
        }

        return jsonResponse({
          connected: true,
          account_id: data.stripe_account_id,
          email: data.stripe_user_email,
          display_name: data.stripe_display_name,
          payouts_enabled: data.stripe_payouts_enabled,
          connected_at: data.connected_at,
          default_currency: data.stripe_default_currency,
        });
      }

      return jsonResponse({ connected: false });
    }

    if (action === "disconnect") {
      if (!stripeClientId || !stripeSecretKey) {
        return jsonResponse({ error: "Stripe Connect not configured on platform" }, 500);
      }

      const { data: settings } = await supabase
        .from("org_stripe_settings")
        .select("stripe_account_id")
        .eq("organization_id", organization_id)
        .single();

      if (settings?.stripe_account_id) {
        try {
          const stripe = new Stripe(stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
          await stripe.oauth.deauthorize({
            client_id: stripeClientId,
            stripe_user_id: settings.stripe_account_id,
          });
        } catch (deauthError) {
          console.warn("[stripe-connect-oauth] Deauthorize failed:", deauthError);
        }
      }

      const { error } = await supabase
        .from("org_stripe_settings")
        .delete()
        .eq("organization_id", organization_id);

      if (error) {
        return jsonResponse({ error: "Failed to disconnect" }, 500);
      }

      return jsonResponse({ success: true });
    }

    if (action === "save_manual_keys") {
      if (!secret_key) {
        return jsonResponse({ error: "Stripe secret key is required" }, 400);
      }

      // Guard 1 — Block platform key reuse
      if (stripeSecretKey && secret_key.trim() === stripeSecretKey.trim()) {
        return jsonResponse({
          error: "This appears to be the TidyWise platform's Stripe key, not your personal Stripe account key. Please log into YOUR Stripe account at dashboard.stripe.com and copy your own Secret key from Developers → API keys.",
        }, 400);
      }

      // Guard 2 — Block cross-tenant key reuse
      const { data: existingOrgWithKey } = await supabase
        .from("org_stripe_settings")
        .select("organization_id")
        .eq("stripe_secret_key", secret_key)
        .neq("organization_id", organization_id)
        .maybeSingle();

      if (existingOrgWithKey) {
        return jsonResponse({
          error: "This Stripe key is already connected to another TidyWise account. Each business must use its own separate Stripe account.",
        }, 400);
      }

      if (!secret_key.startsWith("sk_live_") && !secret_key.startsWith("sk_test_") && !secret_key.startsWith("rk_live_") && !secret_key.startsWith("rk_test_")) {
        let hint = "Stripe secret keys start with sk_live_ or sk_test_.";
        if (secret_key.startsWith("pk_")) {
          hint = "You entered a publishable key (pk_...). Please use your secret key instead (sk_live_... or sk_test_...).";
        } else if (secret_key.startsWith("mk_")) {
          hint = "You entered a management key (mk_...). Please use your secret key instead. Go to Stripe Dashboard → Developers → API keys and copy the Secret key (sk_live_... or sk_test_...).";
        }
        return jsonResponse({ error: hint }, 400);
      }

      if (publishable_key && !publishable_key.startsWith("pk_live_") && !publishable_key.startsWith("pk_test_")) {
        return jsonResponse({ error: "Publishable key must start with pk_live_ or pk_test_." }, 400);
      }

      try {
        const testStripe = new Stripe(secret_key, { apiVersion: STRIPE_API_VERSION });

        let accountEmail: string | null = null;
        let displayName: string | null = null;
        let payoutsEnabled = true;
        let defaultCurrency = "usd";
        let warning: string | null = null;

        try {
          await testStripe.balance.retrieve();
        } catch (validationError) {
          const validationMessage = extractStripeErrorMessage(validationError);
          const lowerValidationMessage = validationMessage.toLowerCase();

          if (
            lowerValidationMessage.includes("invalid api key") ||
            lowerValidationMessage.includes("expired api key") ||
            lowerValidationMessage.includes("authentication") ||
            lowerValidationMessage.includes("you did not provide an api key") ||
            lowerValidationMessage.includes("api key provided")
          ) {
            return jsonResponse({
              error: "Invalid Stripe secret key. Please copy the full Secret key from Stripe Dashboard → Developers → API keys and try again.",
            }, 400);
          }

          warning = "Key saved, but Stripe could not fully verify all permissions for this key. If charges fail later, switch to a full-access secret key.";
          console.warn("[stripe-connect-oauth] Non-blocking key validation warning:", validationMessage);
        }

        try {
          const account = await testStripe.accounts.retrieve();
          accountEmail = account.email || null;
          displayName = account.business_profile?.name || account.settings?.dashboard?.display_name || null;
          payoutsEnabled = account.payouts_enabled ?? true;
          defaultCurrency = account.default_currency || "usd";
        } catch (accountError) {
          console.warn("[stripe-connect-oauth] Could not fetch account details for manual key:", extractStripeErrorMessage(accountError));
          warning = warning || "Key saved. Some Stripe account details could not be loaded because this key has limited permissions.";
        }

        // Guard 3 — Detect suspicious business name
        const isSuspiciousName = displayName &&
          (displayName.toLowerCase().includes("tidywise") ||
           displayName.toLowerCase() === "tidy wise");

        const { error: upsertError } = await supabase
          .from("org_stripe_settings")
          .upsert({
            organization_id,
            stripe_secret_key: secret_key,
            stripe_publishable_key: publishable_key || null,
            stripe_user_email: accountEmail,
            stripe_display_name: displayName,
            stripe_payouts_enabled: payoutsEnabled,
            stripe_default_currency: defaultCurrency,
            is_connected: true,
            connected_at: new Date().toISOString(),
            stripe_account_id: null,
            stripe_access_token: null,
          }, { onConflict: "organization_id" });

        if (upsertError) {
          console.error("[stripe-connect-oauth] Manual keys upsert error:", upsertError);
          return jsonResponse({ error: "Failed to save keys" }, 500);
        }

        return jsonResponse({
          success: true,
          connected: true,
          legacy: true,
          email: accountEmail,
          display_name: displayName,
          payouts_enabled: payoutsEnabled,
          warning,
          needs_business_name_change: isSuspiciousName || false,
        });
      } catch (stripeError) {
        const message = extractStripeErrorMessage(stripeError);
        console.error("[stripe-connect-oauth] Manual key validation failed:", message);
        return jsonResponse({
          error: `Could not validate key: ${message}`,
        }, 400);
      }
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("[stripe-connect-oauth] Error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
