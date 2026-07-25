// Shared helper to fetch organization email settings (server-side only).
// This is the SINGLE SOURCE OF TRUTH for email sender identity.
// NO FALLBACKS - if settings are missing, we block sending.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OrgEmailSettings {
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  email_footer: string | null;
  resend_api_key: string | null;
  // Gmail SMTP fields
  smtp_email: string | null;
  smtp_app_password: string | null;
  email_send_method: "resend" | "gmail_smtp";
  gmail_account_type: "consumer" | "workspace";
}

export interface OrgEmailSettingsResult {
  success: boolean;
  settings?: OrgEmailSettings;
  error?: string;
}

export async function getOrgEmailSettings(organizationId: string): Promise<OrgEmailSettingsResult> {
  if (!organizationId) {
    console.error("[getOrgEmailSettings] Missing organizationId");
    return { success: false, error: "Missing organizationId - organization context is required for email sending" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return { success: false, error: "Database connection not configured" };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("organization_email_settings")
    .select(
      "from_name, from_email, reply_to_email, email_footer, resend_api_key, smtp_email, smtp_app_password, email_send_method, gmail_account_type",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[getOrgEmailSettings] Error:", error);
    return { success: false, error: "Failed to fetch organization email settings" };
  }
  if (!data) {
    return {
      success: false,
      error: "Email settings not configured for this organization. Please set up your email identity in Settings → Emails.",
    };
  }
  if (!data.from_name || !data.from_email) {
    return {
      success: false,
      error: "Email settings incomplete. Both 'From Name' and 'From Email' are required.",
    };
  }

  return {
    success: true,
    settings: {
      from_name: data.from_name,
      from_email: data.from_email,
      reply_to_email: data.reply_to_email ?? null,
      email_footer: data.email_footer ?? null,
      resend_api_key: data.resend_api_key ?? null,
      smtp_email: data.smtp_email ?? null,
      smtp_app_password: data.smtp_app_password ?? null,
      email_send_method: (data.email_send_method ?? "gmail_smtp") as "resend" | "gmail_smtp",
      gmail_account_type: (data.gmail_account_type ?? "consumer") as "consumer" | "workspace",
    },
  };
}

export function formatEmailFrom(settings: OrgEmailSettings): string {
  return `${settings.from_name} <${settings.from_email}>`;
}

export function getReplyTo(settings: OrgEmailSettings): string {
  return settings.reply_to_email || settings.from_email;
}
