import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getOrgEmailSettings, formatEmailFrom, getReplyTo } from "../_shared/get-org-email-settings.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

// Platform-level Resend API key (shared service)
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
  organizationId: string; // REQUIRED - no fallback allowed
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
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
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
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!data.organizationId) {
      console.error("Missing organizationId - cannot send invoice without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch email settings from organization_email_settings table (SINGLE SOURCE OF TRUTH)
    const emailSettingsResult = await getOrgEmailSettings(data.organizationId);
    
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      console.error("Failed to get email settings:", emailSettingsResult.error);
      return new Response(JSON.stringify({ 
        error: emailSettingsResult.error || "Email settings not configured" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailSettings = emailSettingsResult.settings;
    const companyName = emailSettings.from_name;
    
    console.log("[send-invoice] Using org email settings - from:", emailSettings.from_email, "name:", companyName);

    // STRICT ISOLATION: Get organization-specific Stripe credentials - NO FALLBACK ALLOWED
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const { data: orgStripeSettings, error: stripeSettingsError } = await supabase
      .from("org_stripe_settings")
      .select("stripe_secret_key")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (stripeSettingsError) {
      console.error("[send-invoice] Error fetching Stripe settings for org:", data.organizationId, stripeSettingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Stripe configuration" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // CRITICAL: NO FALLBACK - Organization must have its own Stripe key configured
    if (!orgStripeSettings?.stripe_secret_key) {
      console.error("[send-invoice] No Stripe key configured for organization:", data.organizationId);
      return new Response(
        JSON.stringify({ error: "Stripe not configured for this organization. Please connect your Stripe account in Settings → Payments." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("[send-invoice] Using organization-specific Stripe key for org:", data.organizationId);
    const stripe = new Stripe(orgStripeSettings.stripe_secret_key, {
      apiVersion: "2025-08-27.basil",
    });

    // STRICT ISOLATION: Look for customer scoped to this org by email + org metadata
    const customers = await stripe.customers.list({ email: customerEmail, limit: 100 });
    let customerId: string | undefined;

    // Only accept customers explicitly tagged to this organization
    const orgCustomer = customers.data.find((c: Stripe.Customer) =>
      c.metadata?.organization_id === data.organizationId
    );

    if (orgCustomer) {
      customerId = orgCustomer.id;
      console.log("[send-invoice] Found existing org-specific Stripe customer:", customerId);
    } else {
      // Create new customer WITH organization_id in metadata for isolation
      const newCustomer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
        metadata: { organization_id: data.organizationId },
      });
      customerId = newCustomer.id;
      console.log("[send-invoice] Created new org-specific Stripe customer:", customerId);
    }

    // Create a Stripe Checkout session for this invoice payment
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
            unit_amount: Math.round(data.amount * 100), // Convert to cents
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
    console.log("Created Stripe checkout session:", session.id, "URL:", paymentUrl);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${data.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#333333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td style="padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#1e5bb0;padding:30px;text-align:center;">
              <div style="font-size:32px;font-weight:bold;color:#ffffff;">
                ${companyName}
              </div>
              <p style="color:#ffffff;font-size:14px;margin:5px 0 0 0;">Professional Cleaning Services</p>
            </td>
          </tr>
          
          <!-- Invoice Banner -->
          <tr>
            <td style="background-color:#2563eb;padding:15px;text-align:center;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;">Invoice #${data.invoiceNumber}</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px;margin:0 0 15px 0;">Hi ${customerName || "there"},</p>
              
              <p style="margin:0 0 20px 0;">Please find your invoice details below. Payment is due ${data.validUntil ? `by ${data.validUntil}` : 'upon receipt'}.</p>
              
              <!-- Invoice Details -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9f9f9;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 15px 0;color:#1e5bb0;font-size:16px;">INVOICE DETAILS</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Invoice Number</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">#${data.invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Service</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${data.serviceName || 'Cleaning Service'}</td>
                      </tr>
                      ${data.address ? `
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Address</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${data.address}</td>
                      </tr>
                      ` : ''}
                      ${data.validUntil ? `
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Due Date</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${data.validUntil}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding:12px 0;color:#666;font-size:18px;">Total Amount Due</td>
                        <td style="padding:12px 0;text-align:right;font-weight:bold;font-size:24px;color:#2563eb;">$${data.amount.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Pay Now Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${paymentUrl}" target="_blank" style="display:inline-block;background-color:#22c55e;color:#ffffff;font-size:18px;font-weight:bold;text-decoration:none;padding:16px 40px;border-radius:8px;box-shadow:0 4px 6px rgba(34,197,94,0.3);">
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
                <strong>Notes:</strong><br>
                ${data.notes}
              </div>
              ` : ''}
              
              <hr style="border:none;border-top:1px solid #e0e0e0;margin:25px 0;">
              
              <p style="margin:0 0 10px 0;text-align:center;font-size:14px;color:#666;">
                Questions? Reply to this email or contact us anytime.
              </p>
              <p style="margin:0;text-align:center;font-size:16px;font-weight:bold;color:#1e5bb0;">
                Thank you for choosing ${companyName}!
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
        Authorization: `Bearer ${RESEND_API_KEY}`,
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

    // If domain not verified, return helpful error
    if (!response.ok && responseData?.name === 'validation_error' && responseData?.message?.includes('not verified')) {
      const domain = emailSettings.from_email.split('@')[1];
      console.error(`Domain ${domain} is not verified on Resend`);
      throw new Error(`Your email domain (${domain}) is not verified. Please verify it at https://resend.com/domains to send emails.`);
    }

    if (!response.ok) {
      console.error("Resend API error:", { status: response.status, data: responseData });
      throw new Error(responseData?.message || `Failed to send email (status ${response.status})`);
    }

    console.log("Invoice email sent successfully:", responseData);

    // Audit log: successful invoice email
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
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-invoice function:", error);

    // Audit log: failed invoice email
    logAudit({
      action: AuditActions.EMAIL_INVOICE,
      organizationId: 'unknown',
      success: false,
      error: error?.message || 'Unknown error',
    });

    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
