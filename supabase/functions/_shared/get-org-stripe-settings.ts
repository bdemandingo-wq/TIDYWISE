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
 * Falls back to the global STRIPE_SECRET_KEY if no org-specific key is found.
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

  // Try to get org-specific Stripe settings
  const { data: orgSettings, error: settingsError } = await supabase
    .from("org_stripe_settings")
    .select("stripe_secret_key, stripe_publishable_key, stripe_account_id, is_connected")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (settingsError) {
    console.error("[get-org-stripe-settings] Error fetching org settings:", settingsError);
    // Don't fail - try fallback
  }

  let stripeSecretKey: string | null = null;

  if (orgSettings?.stripe_secret_key) {
    // Use org-specific key
    stripeSecretKey = orgSettings.stripe_secret_key;
    console.log("[get-org-stripe-settings] Using organization-specific Stripe key for org:", organizationId);
  } else {
    // Fallback to global key (for backwards compatibility during migration)
    stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || null;
    if (stripeSecretKey) {
      console.log("[get-org-stripe-settings] Falling back to global STRIPE_SECRET_KEY for org:", organizationId);
    }
  }

  if (!stripeSecretKey) {
    return { 
      success: false, 
      error: "No Stripe key configured. Please connect your Stripe account in Settings → Payments." 
    };
  }

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
