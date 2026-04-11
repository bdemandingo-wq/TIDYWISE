import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getOrgEmailSettings, formatEmailFrom, getReplyTo } from "../_shared/get-org-email-settings.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceEmailRequest {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  invoiceNumber: number;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  total: number;
  address?: string;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
  organizationId: string;
}

const ACCENT = "#0ea5e9";
const SLATE = "#0f172a";
const MUTED = "#475569";
const BORDER = "#e2e8f0";
const BG = "#f8fafc";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;
const formatInvoiceNumber = (invoiceNumber: number) => `INV-${String(invoiceNumber).padStart(4, "0")}`;
const formatDateLabel = (value?: string) => (value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

const renderAddress = (address?: string) => {
  if (!address) return "";
  return escapeHtml(address).replace(/\n/g, "<br />");
};

const handler = async (req: Request): Promise<Response> => {
  console.log("[send-invoice] Function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Email service is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let organizationId = "unknown";

  try {
    const data: InvoiceEmailRequest = await req.json();
    organizationId = data.organizationId || "unknown";

    const customerEmail = (data.customerEmail || "").trim();
    const customerName = (data.customerName || "").trim() || "Customer";

    if (!customerEmail) {
      return new Response(JSON.stringify({ error: "Missing customerEmail" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!data.organizationId) {
      return new Response(JSON.stringify({ error: "Missing organizationId - organization context is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailSettingsResult = await getOrgEmailSettings(data.organizationId);
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      return new Response(JSON.stringify({ error: emailSettingsResult.error || "Email settings not configured" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailSettings = emailSettingsResult.settings;
    const resendApiKey = emailSettings.resend_api_key || RESEND_API_KEY;

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { data: bizSettings } = await supabase
      .from("business_settings")
      .select("company_name, company_email, company_phone, company_address, company_city, company_state, company_zip")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const { data: orgStripeSettings, error: stripeSettingsError } = await supabase
      .from("org_stripe_settings")
      .select("stripe_secret_key")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (stripeSettingsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch Stripe configuration" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!orgStripeSettings?.stripe_secret_key) {
      return new Response(JSON.stringify({ error: "Stripe not configured for this organization. Please connect your Stripe account in Settings → Payments." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const stripe = new Stripe(orgStripeSettings.stripe_secret_key, {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: customerEmail, limit: 100 });
    let customerId: string | undefined;

    const orgCustomer = customers.data.find((c: Stripe.Customer) => c.metadata?.organization_id === data.organizationId);
    if (orgCustomer) {
      customerId = orgCustomer.id;
    } else {
      const newCustomer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        metadata: { organization_id: data.organizationId },
      });
      customerId = newCustomer.id;
    }

    const invoiceNumber = formatInvoiceNumber(data.invoiceNumber);
    const safeLineItems = (data.lineItems || [])
      .filter((item) => item && item.description)
      .map((item) => ({
        description: escapeHtml(item.description),
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
        total: Number(item.total || 0),
      }));

    const origin = req.headers.get("origin") || "https://tidywisecleaning.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${invoiceNumber} - Invoice Payment`,
              description: data.address ? `Service at ${data.address.replace(/\n/g, ", ")}` : undefined,
            },
            unit_amount: Math.round(Number(data.total || 0) * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment-success?invoice=${data.invoiceNumber}`,
      cancel_url: `${origin}/payment-canceled?invoice=${data.invoiceNumber}`,
      metadata: {
        invoice_number: String(data.invoiceNumber),
      },
    });

    const paymentUrl = session.url;
    const companyName = bizSettings?.company_name || emailSettings.from_name || "TidyWise";
    const companyMeta = [
      [bizSettings?.company_address, [bizSettings?.company_city, bizSettings?.company_state, bizSettings?.company_zip].filter(Boolean).join(", ")].filter(Boolean).join("\n"),
      [bizSettings?.company_phone, bizSettings?.company_email || emailSettings.from_email].filter(Boolean).join(" · "),
    ].filter(Boolean);

    const lineItemsRows = safeLineItems
      .map(
        (item) => `
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${SLATE};">${item.description}</td>
            <td style="padding:14px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${SLATE};text-align:right;">${item.quantity}</td>
            <td style="padding:14px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${SLATE};text-align:right;">${formatMoney(item.unitPrice)}</td>
            <td style="padding:14px 0;border-bottom:1px solid ${BORDER};font-size:14px;color:${SLATE};text-align:right;font-weight:600;">${formatMoney(item.total)}</td>
          </tr>`
      )
      .join("");

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${invoiceNumber}</title>
</head>
<body style="margin:0;padding:24px;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${SLATE};">
  <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:20px;overflow:hidden;">
    <div style="padding:32px;border-bottom:1px solid ${BORDER};display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:28px;font-weight:800;letter-spacing:-0.03em;color:${SLATE};">${escapeHtml(companyName)}</div>
        ${companyMeta.map((line) => `<div style="font-size:14px;line-height:1.6;color:${MUTED};margin-top:4px;">${renderAddress(line)}</div>`).join("")}
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};">Invoice</div>
        <div style="font-size:34px;font-weight:800;letter-spacing:-0.03em;color:${SLATE};margin-top:6px;">${invoiceNumber}</div>
        <div style="display:inline-block;margin-top:12px;padding:6px 12px;border-radius:999px;background:#e0f2fe;color:${ACCENT};font-size:12px;font-weight:700;">Sent</div>
      </div>
    </div>

    <div style="padding:32px;border-bottom:1px solid ${BORDER};display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;">
      <div>
        <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};margin-bottom:10px;">Bill To</div>
        <div style="font-size:16px;font-weight:700;color:${SLATE};">${escapeHtml(customerName)}</div>
        <div style="font-size:14px;color:${MUTED};margin-top:6px;">${escapeHtml(customerEmail)}</div>
        ${data.customerPhone ? `<div style="font-size:14px;color:${MUTED};margin-top:4px;">${escapeHtml(data.customerPhone)}</div>` : ""}
        ${data.address ? `<div style="font-size:14px;color:${MUTED};margin-top:10px;line-height:1.6;">${renderAddress(data.address)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};margin-bottom:10px;">Invoice Date</div>
        <div style="font-size:16px;font-weight:600;color:${SLATE};">${escapeHtml(formatDateLabel(data.invoiceDate) || formatDateLabel(new Date().toISOString()))}</div>
        ${data.dueDate ? `<div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};margin:18px 0 10px;">Due Date</div><div style="font-size:16px;font-weight:600;color:${SLATE};">${escapeHtml(formatDateLabel(data.dueDate))}</div>` : ""}
      </div>
    </div>

    <div style="padding:24px 32px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <thead>
          <tr>
            <th style="padding:12px 0;border-bottom:1px solid ${BORDER};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};text-align:left;">Description</th>
            <th style="padding:12px 0;border-bottom:1px solid ${BORDER};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};text-align:right;">Qty</th>
            <th style="padding:12px 0;border-bottom:1px solid ${BORDER};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};text-align:right;">Unit Price</th>
            <th style="padding:12px 0;border-bottom:1px solid ${BORDER};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${MUTED};text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${lineItemsRows}</tbody>
      </table>
    </div>

    <div style="padding:0 32px 24px;display:flex;justify-content:flex-end;">
      <div style="width:100%;max-width:320px;border:1px solid ${BORDER};border-radius:16px;padding:18px 20px;">
        <div style="display:flex;justify-content:space-between;gap:16px;font-size:14px;color:${SLATE};margin-bottom:10px;">
          <span style="color:${MUTED};">Subtotal</span>
          <span>${formatMoney(data.subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;gap:16px;font-size:18px;font-weight:800;color:${ACCENT};">
          <span>Total</span>
          <span>${formatMoney(data.total)}</span>
        </div>
      </div>
    </div>

    <div style="padding:0 32px 32px;">
      <a href="${paymentUrl}" target="_blank" style="display:block;background:${ACCENT};color:#ffffff;text-decoration:none;text-align:center;padding:16px 20px;border-radius:14px;font-size:16px;font-weight:700;">Pay ${formatMoney(data.total)}</a>
      <div style="font-size:13px;color:${MUTED};text-align:center;margin-top:10px;">Secure payment powered by Stripe</div>
    </div>

    ${data.notes ? `<div style="padding:0 32px 32px;"><div style="border:1px solid ${BORDER};border-radius:16px;padding:18px 20px;"><div style="font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${ACCENT};margin-bottom:10px;">Notes</div><div style="font-size:14px;line-height:1.7;color:${MUTED};">${escapeHtml(data.notes).replace(/\n/g, "<br />")}</div></div></div>` : ""}

    <div style="padding:24px 32px;border-top:1px solid ${BORDER};font-size:13px;line-height:1.7;color:${MUTED};text-align:center;">
      Questions? Reply to this email or call ${escapeHtml(bizSettings?.company_phone || "your office")}<br />
      ${escapeHtml(companyName)}
    </div>
  </div>
</body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: formatEmailFrom(emailSettings),
        to: [customerEmail],
        reply_to: getReplyTo(emailSettings),
        subject: `${invoiceNumber} from ${companyName} — Pay Online`,
        html: emailHtml,
      }),
    });

    let responseData: any = null;
    try {
      responseData = await response.json();
    } catch (_e) {
      responseData = null;
    }

    if (!response.ok && responseData?.name === "validation_error" && responseData?.message?.includes("not verified")) {
      const domain = emailSettings.from_email.split("@")[1];
      throw new Error(`Your email domain (${domain}) is not verified. Please verify it to send emails.`);
    }

    if (!response.ok) {
      throw new Error(responseData?.message || `Failed to send email (status ${response.status})`);
    }

    logAudit({
      action: AuditActions.EMAIL_INVOICE,
      organizationId: data.organizationId,
      resourceType: "invoice",
      resourceId: String(data.invoiceNumber),
      details: { customerEmail, amount: data.total },
      success: true,
    });

    return new Response(JSON.stringify({ success: true, emailId: responseData?.id, paymentUrl, stripeSessionId: session.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-invoice function:", error);

    logAudit({
      action: AuditActions.EMAIL_INVOICE,
      organizationId,
      success: false,
      error: error?.message || "Unknown error",
    });

    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
