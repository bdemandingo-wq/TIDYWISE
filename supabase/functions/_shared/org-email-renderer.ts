// Shared organization-branded email renderer.
// Single source of truth for HTML used in:
//   - Real customer emails (booking confirmation, reminder, etc.)
//   - Preview Email dialog in Settings → Emails
//   - Send Test Email from Settings → Emails
// The identical function is used for all three paths so previews match reality.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderSectionsToHtml, type EmailSection } from "./email-sections.ts";

export interface OrgBrand {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  emailFooter: string | null;
}

export interface BookingEmailData {
  customer_name: string;
  booking_number: string;
  service_name: string;
  scheduled_date: string;
  scheduled_time: string;
  address: string;
  total_amount: string;
  company_name: string;
}

export const SAMPLE_BOOKING_DATA: BookingEmailData = {
  customer_name: "Jane Doe",
  booking_number: "BK-10234",
  service_name: "Deep Cleaning",
  scheduled_date: "January 15, 2026",
  scheduled_time: "10:00 AM",
  address: "123 Main Street, Anytown",
  total_amount: "185.00",
  company_name: "Your Company",
};

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function replaceBookingVariables(text: string, data: BookingEmailData): string {
  if (!text) return "";
  let out = text;
  for (const [key, val] of Object.entries(data)) {
    out = out.replaceAll(`{{${key}}}`, String(val ?? ""));
  }
  return out;
}

/** Resolve a `storage:<bucket>:<path>` URL or return the raw URL. */
function resolveLogoUrl(logoUrl: string | null, supabaseUrl: string): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("storage:")) {
    const [, bucket, ...pathParts] = logoUrl.split(":");
    const path = pathParts.join(":");
    if (!bucket || !path) return null;
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }
  return logoUrl;
}

/** Load full branding for an org (business_settings + organization_email_settings). */
export async function loadOrgBrand(organizationId: string): Promise<
  { success: true; brand: OrgBrand } | { success: false; error: string }
> {
  if (!organizationId) {
    return { success: false, error: "Missing organizationId" };
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [{ data: bs, error: bsErr }, { data: es, error: esErr }] = await Promise.all([
    supabase
      .from("business_settings")
      .select("company_name, logo_url, primary_color, accent_color")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organization_email_settings")
      .select("from_name, from_email, reply_to_email, email_footer")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (bsErr) return { success: false, error: `business_settings: ${bsErr.message}` };
  if (esErr) return { success: false, error: `organization_email_settings: ${esErr.message}` };
  if (!es || !es.from_name || !es.from_email) {
    return {
      success: false,
      error:
        "Email identity not configured. Set From Name and From Email in Settings → Emails.",
    };
  }

  const brand: OrgBrand = {
    companyName: bs?.company_name || es.from_name,
    logoUrl: resolveLogoUrl(bs?.logo_url ?? null, supabaseUrl),
    primaryColor: bs?.primary_color || "#1e5bb0",
    accentColor: bs?.accent_color || "#14b8a6",
    fromName: es.from_name,
    fromEmail: es.from_email,
    replyToEmail: es.reply_to_email || es.from_email,
    emailFooter: es.email_footer ?? null,
  };
  return { success: true, brand };
}

export interface RenderOptions {
  brand: OrgBrand;
  subject: string;
  /** Legacy plain-text body (fallback when no sections). Supports \n and {{vars}}. */
  bodyText?: string;
  /** Preferred: structured rich-text sections built in the UI. */
  sections?: import("./email-sections.ts").EmailSection[];
  /** Booking data used for variable substitution and appointment card */
  data: BookingEmailData;
  /** If true, renders a structured appointment card under the body */
  showAppointmentCard?: boolean;
  /** Label shown in the banner (e.g. "Booking Confirmed" or "Appointment Reminder") */
  bannerLabel?: string;
}

/**
 * Renders a fully branded, responsive HTML email using the org's identity.
 * If `sections` are provided, they take precedence over `bodyText`.
 */
export function renderBrandedEmail(opts: RenderOptions): { subject: string; html: string } {
  const { brand, data } = opts;
  const subject = replaceBookingVariables(opts.subject || "", data);

  let bodyHtml = "";
  if (opts.sections && opts.sections.length > 0) {
    // Async import would break serve; use dynamic import already resolved above via type-only.
    // The runtime import happens through the shared module path.
    // deno-lint-ignore no-explicit-any
    const mod = (globalThis as any).__emailSectionsMod as
      | typeof import("./email-sections.ts")
      | undefined;
    // Fallback: require via URL if not cached.
    // We accept that sections rendering is done via the helper below.
    bodyHtml = renderSectionsInline(opts.sections, data, brand.primaryColor, mod);
  } else {
    const bodyReplaced = replaceBookingVariables(opts.bodyText || "", data);
    bodyHtml = bodyReplaced
      .split(/\n{2,}/)
      .map((para) => {
        const lines = para.split(/\n/).map(escapeHtml).join("<br />");
        return `<p style="margin:0 0 16px 0;font-size:15px;color:#374151;line-height:1.65;">${lines}</p>`;
      })
      .join("");
  }


  const primary = brand.primaryColor;
  const accent = brand.accentColor;
  const companyName = escapeHtml(brand.companyName);
  const logo = brand.logoUrl;
  const banner = escapeHtml(opts.bannerLabel || "");
  const footerCustom = brand.emailFooter
    ? `<p style="color:#9ca3af;font-size:12px;margin:0 0 6px;line-height:1.5;">${escapeHtml(brand.emailFooter)}</p>`
    : "";

  const headerBlock = logo
    ? `<img src="${escapeHtml(logo)}" alt="${companyName}" height="56" style="max-height:56px;display:block;margin:0 auto;background:#fff;padding:6px 10px;border-radius:8px;" />`
    : `<div style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">${companyName}</div>`;

  const bannerBlock = banner
    ? `<tr><td style="background-color:${accent};padding:14px;text-align:center;">
         <span style="color:#ffffff;font-size:15px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">${banner}</span>
       </td></tr>`
    : "";

  const appointmentCard = opts.showAppointmentCard
    ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9fafb;border-radius:12px;margin:8px 0 24px;border:1px solid #e5e7eb;">
      <tr><td style="padding:22px 24px;">
        <h3 style="margin:0 0 14px;color:${primary};font-size:12px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Appointment Details</h3>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size:14px;color:#1f2937;">
          <tr><td style="padding:6px 0;color:#6b7280;width:130px;">Booking #</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.booking_number)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Service</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.service_name)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.scheduled_date)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Time</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.scheduled_time)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Address</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(data.address)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Total</td><td style="padding:6px 0;font-weight:700;color:${primary};">$${escapeHtml(data.total_amount)}</td></tr>
        </table>
      </td></tr>
    </table>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr><td style="padding:24px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:linear-gradient(135deg, ${primary} 0%, ${accent} 100%);padding:36px 24px;text-align:center;">
            ${headerBlock}
          </td>
        </tr>
        ${bannerBlock}
        <tr>
          <td style="padding:32px 28px 8px;">
            ${bodyHtml}
            ${appointmentCard}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 28px 28px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0 18px;" />
            <p style="margin:0;text-align:center;font-size:13px;color:#6b7280;">
              Questions? Reply to this email — it goes straight to ${escapeHtml(brand.replyToEmail)}.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#111827;padding:22px 24px;text-align:center;">
            <p style="color:#ffffff;font-size:15px;font-weight:600;margin:0 0 4px;">${companyName}</p>
            ${footerCustom}
            <p style="color:#9ca3af;font-size:11px;margin:6px 0 0;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
