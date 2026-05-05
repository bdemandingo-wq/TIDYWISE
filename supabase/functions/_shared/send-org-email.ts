// Shared helper: send via Gmail (per-org connection) when available, else fall back to Resend.
// Drop-in replacement for direct Resend calls in edge functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendViaGmail } from "./gmail-send-core.ts";
import { getOrgEmailSettings } from "./get-org-email-settings.ts";

export interface SendEmailInput {
  organization_id: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  from_name?: string; // override; otherwise org settings
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export interface SendEmailResult {
  success: boolean;
  provider: "gmail" | "resend" | "none";
  message_id?: string;
  error?: string;
}

export async function sendOrgEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!input.organization_id) {
    return { success: false, provider: "none", error: "organization_id required" };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Try Gmail first
  const { data: gmail } = await supabase
    .from("org_gmail_connections")
    .select("status")
    .eq("organization_id", input.organization_id)
    .maybeSingle();

  if (gmail?.status === "active") {
    const orgSettings = await getOrgEmailSettings(input.organization_id);
    const fromName = input.from_name
      || (orgSettings.success ? orgSettings.settings!.from_name : undefined);
    const replyTo = input.reply_to
      || (orgSettings.success ? orgSettings.settings!.reply_to_email || undefined : undefined);

    const r = await sendViaGmail({
      organization_id: input.organization_id,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      from_name: fromName,
      reply_to: replyTo,
      attachments: input.attachments,
    });
    if (r.success) return { success: true, provider: "gmail", message_id: r.message_id };
    console.warn(`[sendOrgEmail] Gmail send failed for org ${input.organization_id}: ${r.error} — falling back to Resend`);
  } else {
    console.warn(`[sendOrgEmail] No active Gmail connection for org ${input.organization_id} — using Resend fallback`);
  }

  // Fall back to Resend using existing org settings
  const settings = await getOrgEmailSettings(input.organization_id);
  if (!settings.success || !settings.settings) {
    return { success: false, provider: "none", error: settings.error || "no_email_settings" };
  }
  const apiKey = settings.settings.resend_api_key || Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { success: false, provider: "none", error: "no_resend_api_key" };
  }

  const fromName = input.from_name || settings.settings.from_name;
  const fromEmail = settings.settings.from_email;
  const from = `${fromName} <${fromEmail}>`;

  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
  };
  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  if (input.reply_to || settings.settings.reply_to_email) {
    payload.reply_to = input.reply_to || settings.settings.reply_to_email;
  }
  if (input.attachments?.length) {
    payload.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, provider: "resend", error: data?.message || `resend_${res.status}` };
  }
  return { success: true, provider: "resend", message_id: data?.id };
}
