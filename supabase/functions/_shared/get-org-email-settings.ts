// Shared helper to fetch organization email settings
// This is the SINGLE SOURCE OF TRUTH for email sender identity
// NO FALLBACKS - if settings are missing, we block sending

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OrgEmailSettings {
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  email_footer: string | null;
}

export interface OrgEmailSettingsResult {
  success: boolean;
  settings?: OrgEmailSettings;
  error?: string;
}

/**
 * Fetches email settings for a specific organization from organization_email_settings table.
 * This is the ONLY source for email sender identity - no fallbacks allowed.
 * 
 * @param organizationId - The organization ID (REQUIRED)
 * @returns OrgEmailSettingsResult with settings or error
 */
export async function getOrgEmailSettings(organizationId: string): Promise<OrgEmailSettingsResult> {
  // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
  if (!organizationId) {
    console.error("[getOrgEmailSettings] Missing organizationId - cannot fetch email settings without organization context");
    return {
      success: false,
      error: "Missing organizationId - organization context is required for email sending"
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[getOrgEmailSettings] Missing database configuration");
    return {
      success: false,
      error: "Database connection not configured"
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Query the organization_email_settings table ONLY - this is the single source of truth
  const { data: emailSettings, error: settingsError } = await supabase
    .from('organization_email_settings')
    .select('from_name, from_email, reply_to_email, email_footer')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (settingsError) {
    console.error("[getOrgEmailSettings] Error fetching email settings:", settingsError);
    return {
      success: false,
      error: "Failed to fetch organization email settings"
    };
  }

  // NO FALLBACKS - if settings don't exist, block sending
  if (!emailSettings) {
    console.error("[getOrgEmailSettings] No email settings found for organization:", organizationId);
    return {
      success: false,
      error: "Email settings not configured for this organization. Please set up your email identity in Settings → Emails."
    };
  }

  // Validate required fields
  if (!emailSettings.from_name || !emailSettings.from_email) {
    console.error("[getOrgEmailSettings] Incomplete email settings for org:", organizationId);
    return {
      success: false,
      error: "Email settings incomplete. Both 'From Name' and 'From Email' are required. Please configure them in Settings → Emails."
    };
  }

  console.log("[getOrgEmailSettings] Loaded email settings for org:", organizationId, "- from:", emailSettings.from_email);

  return {
    success: true,
    settings: {
      from_name: emailSettings.from_name,
      from_email: emailSettings.from_email,
      reply_to_email: emailSettings.reply_to_email,
      email_footer: emailSettings.email_footer
    }
  };
}

/**
 * Formats the "From" header for emails using org settings
 * Format: "Company Name <email@domain.com>"
 */
export function formatEmailFrom(settings: OrgEmailSettings): string {
  return `${settings.from_name} <${settings.from_email}>`;
}

/**
 * Gets the reply-to address, falling back to from_email if not set
 */
export function getReplyTo(settings: OrgEmailSettings): string {
  return settings.reply_to_email || settings.from_email;
}
