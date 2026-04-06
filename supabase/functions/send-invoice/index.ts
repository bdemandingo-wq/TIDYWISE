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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvoiceEmailRequest {
  customerName: string;
  customerEmail: string;
  invoiceNumber: number;
  serviceName: string;
  amount: number;
  address?: string;
  validUntil?: string;
  notes?: string;
  organizationId: string;
}

interface InvoiceBranding {
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  font_style: string;
  header_layout: string;
  footer_message: string;
}

function getFontFamily(style: string): string {
  switch (style) {
    case 'classic': return "'Georgia', 'Times New Roman', serif";
    case 'minimal': return "'Courier New', 'Menlo', monospace";
    default: return "'Inter', system-ui, -apple-system, Arial, sans-serif";
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("[send-invoice] Function called");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("[send-invoice] Missing RESEND_API_KEY secret");
    return new Response(
      JSON.stringify({ error: "Email service is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const data: InvoiceEmailRequest = await req.json();
    console.log("Invoice email request:", data);

    const customerEmail = (data.customerEmail || "").trim();
    const customerName = (data.customerName || "").trim();

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "Missing customerEmail" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!data.organizationId) {
      console.error("Missing organizationId");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // Fetch email settings
    const emailSettingsResult = await getOrgEmailSettings(data.organizationId);
    
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      console.error("Failed to get email settings:", emailSettingsResult.error);
      return new Response(JSON.stringify({ 
        error: emailSettingsResult.error || "Email settings not configured" 
      }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const emailSettings = emailSettingsResult.settings;
    const companyName = emailSettings.from_name;
    const resendApiKey = emailSettings.resend_api_key || RESEND_API_KEY;
    
    console.log("[send-invoice] Using org email settings - from:", emailSettings.from_email, "name:", companyName);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch invoice branding for this organization
    const { data: brandingData } = await supabase
      .from("invoice_branding")
      .select("*")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const branding: InvoiceBranding = {
      logo_url: brandingData?.logo_url || null,
      primary_color: brandingData?.primary_color || '#3b82f6',
      accent_color: brandingData?.accent_color || '#e5e7eb',
      font_style: brandingData?.font_style || 'modern',
      header_layout: brandingData?.header_layout || 'left',
      footer_message: brandingData?.footer_message || 'Thank you for your business!',
    };

    console.log("[send-invoice] Using branding:", branding);

    // Fetch Stripe settings
    const { data: orgStripeSettings, error: stripeSettingsError } = await supabase
      .from("org_stripe_settings")
      .select("stripe_secret_key")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (stripeSettingsError) {
      console.error("[send-invoice] Error fetching Stripe settings:", stripeSettingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe configuration" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!orgStripeSettings?.stripe_secret_key) {
      console.error("[send-invoice] No Stripe key configured for organization:", data.organizationId);
      return new Response(
        JSON.stringify({ error: "Stripe not configured for this organization. Please connect your Stripe account in Settings → Payments." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(orgStripeSettings.stripe_secret_key, {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: customerEmail, limit: 100 });
    let customerId: string | undefined;

    const orgCustomer = customers.data.find((c: Stripe.Customer) =>
      c.metadata?.organization_id === data.organizationId
    );

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

    // Create Stripe Checkout session
    const origin = req.headers.get("origin") || "https://tidywisecleaning.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice #${data.invoiceNumber} - ${data.serviceName || 'Cleaning Service'}`,
              description: data.address ? `Service at ${data.address}` : undefined,
            },
            unit_amount: Math.round(data.amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment-success?invoice=${data.invoiceNumber}`,
      cancel_url: `${origin}/payment-canceled?invoice=${data.invoiceNumber}`,
      metadata: {
        invoice_number: String(data.invoiceNumber),
        service_name: data.serviceName || '',
      },
    });

    const paymentUrl = session.url;

    // Build branded email HTML
    const fontFamily = getFontFamily(branding.font_style);
    const primaryColor = branding.primary_color;
    const accentColor = branding.accent_color;

    // Logo HTML based on header layout
    let logoHtml = '';
    if (branding.logo_url) {
      logoHtml = `<img src="${branding.logo_url}" alt="${companyName}" style="max-height:60px;max-width:200px;object-fit:contain;" />`;
    }

    let headerHtml = '';
    if (branding.header_layout === 'center') {
      headerHtml = `
        <tr>
          <td style="padding:30px;text-align:center;border-bottom:3px solid ${primaryColor};">
            ${logoHtml ? `<div style="margin-bottom:10px;">${logoHtml}</div>` : ''}
            <div style="font-size:24px;font-weight:bold;color:#1a1a1a;font-family:${fontFamily};">${companyName}</div>
            <div style="font-size:28px;font-weight:bold;color:${primaryColor};margin-top:8px;font-family:${fontFamily};">INVOICE #${data.invoiceNumber}</div>
          </td>
        </tr>`;
    } else if (branding.header_layout === 'right') {
      headerHtml = `
        <tr>
          <td style="padding:30px;border-bottom:3px solid ${primaryColor};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  <div style="font-size:28px;font-weight:bold;color:${primaryColor};font-family:${fontFamily};">INVOICE</div>
                  <div style="color:#666;font-size:14px;margin-top:4px;">#${data.invoiceNumber}</div>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  ${logoHtml ? `<div style="margin-bottom:8px;">${logoHtml}</div>` : ''}
                  <div style="font-size:20px;font-weight:bold;color:#1a1a1a;font-family:${fontFamily};">${companyName}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    } else {
      // Left (default)
      headerHtml = `
        <tr>
          <td style="padding:30px;border-bottom:3px solid ${primaryColor};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;">
                  ${logoHtml ? `<div style="margin-bottom:8px;">${logoHtml}</div>` : ''}
                  <div style="font-size:20px;font-weight:bold;color:#1a1a1a;font-family:${fontFamily};">${companyName}</div>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <div style="font-size:28px;font-weight:bold;color:${primaryColor};font-family:${fontFamily};">INVOICE</div>
                  <div style="color:#666;font-size:14px;margin-top:4px;">#${data.invoiceNumber}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${data.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:${fontFamily};color:#333333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td style="padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Branded Header -->
          ${headerHtml}
          
          <!-- Main Content -->
          <tr>
            <td style="padding:30px;font-family:${fontFamily};">
              <p style="font-size:16px;margin:0 0 15px 0;">Hi ${customerName || "there"},</p>
              
              <p style="margin:0 0 20px 0;">Please find your invoice details below. Payment is due ${data.validUntil ? `by ${data.validUntil}` : 'upon receipt'}.</p>
              
              <!-- Invoice Details Table -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr style="background-color:${accentColor}30;">
                        <td style="padding:10px 12px;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;border-bottom:2px solid ${accentColor};">Description</td>
                        <td style="padding:10px 12px;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;text-align:right;border-bottom:2px solid ${accentColor};">Amount</td>
                      </tr>
                      <tr>
                        <td style="padding:12px;border-bottom:1px solid ${accentColor}40;font-weight:500;">${data.serviceName || 'Cleaning Service'}</td>
                        <td style="padding:12px;border-bottom:1px solid ${accentColor}40;text-align:right;font-weight:500;">$${data.amount.toFixed(2)}</td>
                      </tr>
                      ${data.address ? `
                      <tr>
                        <td colspan="2" style="padding:8px 12px;color:#666;font-size:13px;">📍 ${data.address}</td>
                      </tr>
                      ` : ''}
                      ${data.validUntil ? `
                      <tr>
                        <td colspan="2" style="padding:8px 12px;color:#666;font-size:13px;">📅 Due: ${data.validUntil}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding:16px 12px;font-weight:bold;font-size:18px;border-top:2px solid ${primaryColor};color:${primaryColor};">Total Due</td>
                        <td style="padding:16px 12px;font-weight:bold;font-size:24px;text-align:right;border-top:2px solid ${primaryColor};color:${primaryColor};">$${data.amount.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Pay Now Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${paymentUrl}" target="_blank" style="display:inline-block;background-color:${primaryColor};color:#ffffff;font-size:18px;font-weight:bold;text-decoration:none;padding:16px 40px;border-radius:8px;">
                      💳 Pay Now - $${data.amount.toFixed(2)}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="text-align:center;padding-top:10px;">
                    <p style="margin:0;font-size:12px;color:#666;">Secure payment powered by Stripe</p>
                  </td>
                </tr>
              </table>
              
              ${data.notes ? `
              <div style="background-color:#fff3cd;padding:15px;border-radius:6px;border-left:4px solid #ffc107;margin-bottom:20px;">
                <strong style="display:block;margin-bottom:8px;">Notes:</strong>
                <span style="white-space:pre-wrap;word-wrap:break-word;line-height:1.6;">${data.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</span>
              </div>
              ` : ''}
              
              <hr style="border:none;border-top:1px solid ${accentColor}40;margin:25px 0;">
              
              <p style="margin:0 0 10px 0;text-align:center;font-size:14px;color:#666;">
                ${branding.footer_message}
              </p>
              <p style="margin:0;text-align:center;font-size:14px;color:#666;">
                Questions? Reply to this email or contact us anytime.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:#333333;padding:20px;text-align:center;">
              <p style="color:#ffffff;font-size:14px;font-weight:600;margin:0 0 5px 0;">${companyName}</p>
              <p style="color:#999999;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} ${companyName}. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    console.log("Sending invoice email to:", customerEmail);

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
        subject: `Invoice #${data.invoiceNumber} from ${companyName} - Pay Online`,
        html: emailHtml,
      }),
    });

    let responseData: any = null;
    try {
      responseData = await response.json();
    } catch (_e) {
      responseData = null;
    }

    if (!response.ok && responseData?.name === 'validation_error' && responseData?.message?.includes('not verified')) {
      const domain = emailSettings.from_email.split('@')[1];
      throw new Error(`Your email domain (${domain}) is not verified. Please verify it at https://resend.com/domains to send emails.`);
    }

    if (!response.ok) {
      console.error("Resend API error:", { status: response.status, data: responseData });
      throw new Error(responseData?.message || `Failed to send email (status ${response.status})`);
    }

    console.log("Invoice email sent successfully:", responseData);

    logAudit({
      action: AuditActions.EMAIL_INVOICE,
      organizationId: data.organizationId,
      resourceType: 'invoice',
      resourceId: String(data.invoiceNumber),
      details: { customerEmail, amount: data.amount },
      success: true,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailId: responseData?.id,
        paymentUrl: paymentUrl,
        stripeSessionId: session.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-invoice function:", error);

    logAudit({
      action: AuditActions.EMAIL_INVOICE,
      organizationId: 'unknown',
      success: false,
      error: error?.message || 'Unknown error',
    });

    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
