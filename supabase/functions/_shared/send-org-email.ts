// Unified customer-facing org email sender.
// - Routes to Gmail SMTP when the org has email_send_method='gmail_smtp' AND credentials configured.
// - Auto-fallback: if Gmail SMTP fails or the daily limit is reached, the send falls back
//   to Resend (TidyWise platform sender) so customer-facing emails keep flowing. The fallback
//   is logged in org_email_send_failures so the org can see it happened.
// - When Gmail is NOT configured, sends directly via Resend.

//
// Platform / system emails (auth, admin notifications, digests) do NOT use this helper —
// they call Resend directly with the platform key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  getOrgEmailSettings,
  formatEmailFrom,
  getReplyTo,
  type OrgEmailSettings,
} from "./get-org-email-settings.ts";

const GMAIL_CONSUMER_LIMIT = 500;
const GMAIL_WORKSPACE_LIMIT = 2000;

export interface SendOrgEmailOptions {
  organizationId: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; content_type?: string }>;
  // If provided, overrides the org from_name/from_email (rare).
  fromOverride?: string;
}

export interface SendOrgEmailResult {
  success: boolean;
  id?: string;
  method: "gmail_smtp" | "resend" | "none";
  fellBack?: boolean;
  error?: string;
}

function toArr(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function gmailDailyLimit(settings: OrgEmailSettings): number {
  return settings.gmail_account_type === "workspace" ? GMAIL_WORKSPACE_LIMIT : GMAIL_CONSUMER_LIMIT;
}

async function currentGmailDailyCount(orgId: string): Promise<number> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("org_email_daily_sends")
    .select("sent_count")
    .eq("organization_id", orgId)
    .eq("sent_on", today)
    .eq("method", "gmail_smtp")
    .maybeSingle();
  return (data?.sent_count as number | undefined) ?? 0;
}

async function incrementDailyCount(orgId: string, method: "gmail_smtp" | "resend") {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);
  await supabase.rpc("increment_org_email_daily_send", {
    _organization_id: orgId,
    _method: method,
    _delta: 1,
  });
}

async function logFailure(
  orgId: string,
  method: string,
  fellBackTo: string | null,
  recipient: string,
  subject: string,
  error: string,
) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);
  try {
    await supabase.rpc("log_org_email_send_failure", {
      _organization_id: orgId,
      _method: method,
      _fell_back_to: fellBackTo,
      _recipient: recipient,
      _subject: subject,
      _error_message: error.slice(0, 4000),
    });
  } catch (e) {
    console.error("[send-org-email] Could not log failure:", e);
  }
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

async function sendViaGmailSmtp(
  settings: OrgEmailSettings,
  opts: SendOrgEmailOptions,
  from: string,
  replyTo: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!settings.smtp_email || !settings.smtp_app_password) {
    return { ok: false, error: "Gmail SMTP credentials not configured" };
  }
  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: settings.smtp_email, password: settings.smtp_app_password },
    },
  });
  try {
    const html = opts.html + (settings.email_footer ? `<br/><br/><p style="color:#666;font-size:12px;">${settings.email_footer}</p>` : "");
    const text = opts.text ?? "This email requires an HTML-capable client.";
    // Bypass denomailer's buggy quoted-printable encoder — build MIME parts with base64 instead.
    await client.send({
      from,
      to: toArr(opts.to),
      cc: toArr(opts.cc),
      bcc: toArr(opts.bcc),
      replyTo,
      subject: opts.subject,
      mimeContent: [
        { mimeType: 'text/plain; charset="utf-8"', content: b64(text), transferEncoding: "base64" },
        { mimeType: 'text/html; charset="utf-8"', content: b64(html), transferEncoding: "base64" },
      ],
      attachments: (opts.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.content_type,
      })),
    });
    await client.close();
    return { ok: true, id: `gmail-${crypto.randomUUID()}` };
  } catch (e: any) {
    try { await client.close(); } catch (_) { /* ignore */ }
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function sendViaResend(
  settings: OrgEmailSettings,
  opts: SendOrgEmailOptions,
  from: string,
  replyTo: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const key = settings.resend_api_key || Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return { ok: false, error: "No Resend API key configured (add one in Email Settings or contact support)." };
  }
  const payload: Record<string, unknown> = {
    from,
    to: toArr(opts.to),
    reply_to: replyTo,
    subject: opts.subject,
    html: opts.html + (settings.email_footer ? `<br/><br/><p style="color:#666;font-size:12px;">${settings.email_footer}</p>` : ""),
  };
  if (opts.cc) payload.cc = toArr(opts.cc);
  if (opts.bcc) payload.bcc = toArr(opts.bcc);
  if (opts.text) payload.text = opts.text;
  if (opts.attachments?.length) {
    payload.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.content_type,
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.message || `Resend HTTP ${res.status}` };
  }
  return { ok: true, id: body?.id ?? "resend-unknown" };
}

/**
 * High-level org sender. Handles Gmail SMTP → Resend fallback, daily limits, and failure logging.
 */
export async function sendOrgEmail(opts: SendOrgEmailOptions): Promise<SendOrgEmailResult> {
  const settingsResult = await getOrgEmailSettings(opts.organizationId);
  if (!settingsResult.success || !settingsResult.settings) {
    return { success: false, method: "none", error: settingsResult.error };
  }
  const settings = settingsResult.settings;
  const from = opts.fromOverride ?? formatEmailFrom(settings);
  const replyTo = opts.replyTo ?? getReplyTo(settings);
  const primaryRecipient = toArr(opts.to)[0] ?? "";

  const wantsGmail =
    settings.email_send_method === "gmail_smtp" &&
    !!settings.smtp_email &&
    !!settings.smtp_app_password;

  if (wantsGmail) {
    const dailyCount = await currentGmailDailyCount(opts.organizationId);
    const limit = gmailDailyLimit(settings);
    let gmailError: string | null = null;
    if (dailyCount >= limit) {
      gmailError = `Daily Gmail send limit reached (${dailyCount}/${limit})`;
      console.warn(`[send-org-email] ${gmailError} for org ${opts.organizationId}; falling back to Resend.`);
    } else {
      const gmailRes = await sendViaGmailSmtp(settings, opts, from, replyTo);
      if (gmailRes.ok) {
        await incrementDailyCount(opts.organizationId, "gmail_smtp");
        return { success: true, id: gmailRes.id, method: "gmail_smtp" };
      }
      gmailError = gmailRes.error;
      console.error(`[send-org-email] Gmail SMTP failed for org ${opts.organizationId}:`, gmailError);
    }

    // Auto-fallback to Resend (TidyWise platform sender) so customer emails
    // don't silently stop for the rest of the day. The UI promises this.
    const fallbackRes = await sendViaResend(settings, opts, from, replyTo);
    if (fallbackRes.ok) {
      await incrementDailyCount(opts.organizationId, "resend");
      await logFailure(opts.organizationId, "gmail_smtp", "resend", primaryRecipient, opts.subject, gmailError ?? "gmail unavailable");
      return { success: true, id: fallbackRes.id, method: "resend", fellBack: true };
    }
    const combined = `Gmail failed (${gmailError}); Resend fallback also failed: ${fallbackRes.error}`;
    await logFailure(opts.organizationId, "gmail_smtp", "resend", primaryRecipient, opts.subject, combined);
    return { success: false, method: "none", error: combined, fellBack: true };
  }


  // Default path: Resend
  const resendRes = await sendViaResend(settings, opts, from, replyTo);
  if (resendRes.ok) {
    await incrementDailyCount(opts.organizationId, "resend");
    return { success: true, id: resendRes.id, method: "resend" };
  }
  return { success: false, method: "none", error: resendRes.error };
}
