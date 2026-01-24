import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

interface OrgStripeSettings {
  stripe_secret_key: string;
  stripe_publishable_key: string | null;
  stripe_account_id: string | null;
  is_connected: boolean;
}

interface GetOrgStripeResult {
  success: boolean;
  stripe?: Stripe;
  settings?: OrgStripeSettings;
  error?: string;
}

/**
 * Retrieves the organization's Stripe secret key and initializes a Stripe client.
 * STRICT ISOLATION: Only uses organization-specific credentials - NO fallback to global keys.
 * 
 * @param organizationId - The organization's UUID
 * @returns An object with the initialized Stripe client or an error
 */
export async function getOrgStripeClient(organizationId: string): Promise<GetOrgStripeResult> {
  if (!organizationId) {
    return { success: false, error: "Organization ID is required" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return { success: false, error: "Supabase configuration missing" };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Get org-specific Stripe settings - STRICT ISOLATION: No fallback
  const { data: orgSettings, error: settingsError } = await supabase
    .from("org_stripe_settings")
    .select("stripe_secret_key, stripe_publishable_key, stripe_account_id, is_connected")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (settingsError) {
    console.error("[get-org-stripe-settings] Error fetching org settings:", settingsError);
    return { success: false, error: "Failed to fetch Stripe settings" };
  }

  // STRICT ISOLATION: Only use organization-specific key, never fallback to global keys
  if (!orgSettings?.stripe_secret_key) {
    console.log("[get-org-stripe-settings] No Stripe key configured for organization:", organizationId);
    return { 
      success: false, 
      error: "Stripe not configured for this organization. Please connect your Stripe account in Settings → Payments." 
    };
  }

  const stripeSecretKey = orgSettings.stripe_secret_key;
  console.log("[get-org-stripe-settings] Using organization-specific Stripe key for org:", organizationId);

  try {
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
    });

    return {
      success: true,
      stripe,
      settings: orgSettings || undefined,
    };
  } catch (error) {
    console.error("[get-org-stripe-settings] Error initializing Stripe:", error);
    return { 
      success: false, 
      error: "Failed to initialize Stripe client. Please check your API key." 
    };
  }
}
