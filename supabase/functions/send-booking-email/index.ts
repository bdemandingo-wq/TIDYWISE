import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

interface BookingEmailRequest {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  homeSize: string;
  appointmentDate: string;
  appointmentTime: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  extras: string[];
  totalPrice: number;
  confirmationNumber: string;
  organizationId: string; // REQUIRED - no fallback allowed
}

// Helper to send SMS via OpenPhone
async function sendBookingSMS(
  supabase: any,
  organizationId: string,
  customerPhone: string,
  customerName: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName: string,
  companyName: string
): Promise<void> {
  try {
    // Check if SMS is enabled for this org
    const { data: smsSettings } = await supabase
      .from('organization_sms_settings')
      .select('sms_enabled, sms_booking_confirmation, openphone_api_key, openphone_phone_number_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!smsSettings?.sms_enabled || !smsSettings?.sms_booking_confirmation) {
      console.log("[send-booking-email] SMS disabled or confirmation SMS disabled for org:", organizationId);
      return;
    }

    if (!smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("[send-booking-email] OpenPhone not configured for org:", organizationId);
      return;
    }

    if (!customerPhone) {
      console.log("[send-booking-email] No customer phone provided, skipping SMS");
      return;
    }

    // Format phone number
    let formattedPhone = customerPhone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `+1${formattedPhone}`;
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = `+${formattedPhone}`;
    }

    const message = `Hi ${customerName}! Your ${serviceName} booking with ${companyName} is confirmed for ${appointmentDate} at ${appointmentTime}. We look forward to serving you!`;

    console.log(`[send-booking-email] Sending SMS to ${formattedPhone}`);

    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": smsSettings.openphone_api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: smsSettings.openphone_phone_number_id,
        to: [formattedPhone],
        content: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-booking-email] SMS failed: ${response.status} - ${errorText}`);
    } else {
      console.log("[send-booking-email] SMS sent successfully");
    }
  } catch (smsError) {
    console.error("[send-booking-email] SMS error:", smsError);
    // Don't throw - SMS is secondary to email
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY secret");
    return new Response(JSON.stringify({ error: "Email service is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const booking = (await req.json()) as Partial<BookingEmailRequest>;

    const customerEmail = (booking.customerEmail || "").trim();
    const customerName = (booking.customerName || "").trim();

    if (!customerEmail) {
      return new Response(JSON.stringify({ error: "Missing customerEmail" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!booking.organizationId) {
      console.error("Missing organizationId - cannot send email without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required for email sending" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Sending booking confirmation email to:", customerEmail, "for organization:", booking.organizationId);

    // Fetch email settings from organization_email_settings table (SINGLE SOURCE OF TRUTH)
    const emailSettingsResult = await getOrgEmailSettings(booking.organizationId);
    
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
    const senderEmail = emailSettings.from_email;
    const companyName = emailSettings.from_name;
    // Use org-specific Resend API key if configured, otherwise fall back to global
    const resendApiKey = emailSettings.resend_api_key || RESEND_API_KEY;

    // Fetch branding + custom confirmation copy from business_settings
    let logoUrl = "";
    let primaryColor = "#1e5bb0";
    let accentColor = "#14b8a6";
    let customConfirmationBody = "";
    let customConfirmationSubject = "";

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { data: settings } = await supabase
        .from('business_settings')
        .select('logo_url, primary_color, accent_color, confirmation_email_subject, confirmation_email_body')
        .eq('organization_id', booking.organizationId)
        .maybeSingle();

      if (settings) {
        logoUrl = settings.logo_url || "";
        primaryColor = settings.primary_color || "#1e5bb0";
        accentColor = settings.accent_color || "#14b8a6";
        customConfirmationBody = settings.confirmation_email_body || "";
        customConfirmationSubject = settings.confirmation_email_subject || "";
      }
    }

    console.log("Using org email settings - sender:", senderEmail, "name:", companyName);

    const fullAddress = [
      booking.address,
      booking.city,
      booking.state,
      booking.zipCode,
    ]
      .filter(Boolean)
      .join(", ");

    const safeExtras = Array.isArray(booking.extras) ? booking.extras : [];
    const extrasText = safeExtras.length > 0 ? safeExtras.join(", ") : "None";

    // Render template variables for custom subject/body set by the admin
    const renderVars = (input: string): string => {
      const map: Record<string, string> = {
        customer_name: customerName || "there",
        customer_email: customerEmail,
        customer_phone: booking.customerPhone || "",
        company_name: companyName,
        service_name: booking.serviceName || "",
        scheduled_date: booking.appointmentDate || "",
        scheduled_time: booking.appointmentTime || "",
        appointment_date: booking.appointmentDate || "",
        appointment_time: booking.appointmentTime || "",
        address: fullAddress || booking.address || "",
        home_size: booking.homeSize || "",
        extras: extrasText,
        total_amount: String(booking.totalPrice ?? ""),
        booking_number: booking.confirmationNumber || "",
      };
      return input.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key) => map[key] ?? "");
    };

    const escapeHtml = (s: string) => s
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Build the custom intro block (admin-edited copy) styled in the brand color.
    // Falls back to the original default intro if no custom body is set.
    const customIntroHtml = customConfirmationBody
      ? `<div style="margin:0 0 25px 0;font-size:15px;color:${primaryColor};line-height:1.6;white-space:pre-wrap;">${escapeHtml(renderVars(customConfirmationBody))}</div>`
      : `
              <p style="font-size:18px;margin:0 0 20px 0;color:${primaryColor};font-weight:600;">Hi ${customerName || "there"},</p>
              <p style="margin:0 0 15px 0;font-size:15px;color:${primaryColor};">Thank you for booking with <strong>${companyName}</strong>! <strong>You're all set!</strong></p>
              <p style="margin:0 0 25px 0;font-size:15px;color:${primaryColor};">Please review the details below to ensure everything is correct.</p>
            `;

    const emailSubject = customConfirmationSubject
      ? renderVars(customConfirmationSubject)
      : `Booking Confirmed - ${booking.appointmentDate || ""}`;

    // Build logo HTML if available
    const logoHtml = logoUrl 
      ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:60px;max-width:200px;margin-bottom:10px;" />`
      : `<div style="font-size:32px;font-weight:bold;color:#ffffff;">${companyName}</div>`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#333333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td style="padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background:linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%);padding:40px 30px;text-align:center;">
              ${logoHtml}
              <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:10px 0 0 0;letter-spacing:0.5px;">Professional Cleaning Services</p>
            </td>
          </tr>
          
          <!-- Success Banner -->
          <tr>
            <td style="background-color:#22c55e;padding:16px;text-align:center;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;">✓ Booking Confirmed!</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:40px 30px;">
              ${customIntroHtml}
              </tr>
              
              <!-- Appointment Details Card -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9fafb;border-radius:12px;margin-bottom:25px;border:1px solid #e5e7eb;">
                <tr>
                  <td style="padding:25px;">
                    <h3 style="margin:0 0 20px 0;color:${primaryColor};font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Appointment Details</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;width:40%;">Service</td>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;font-size:14px;">${booking.serviceName || "Cleaning Service"}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Date</td>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;font-size:14px;">${booking.appointmentDate || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Time</td>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;font-size:14px;">${booking.appointmentTime || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Address</td>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;font-size:14px;">${fullAddress || booking.address || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Home Size</td>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;font-size:14px;">${booking.homeSize || "Not specified"}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;">Extras</td>
                        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;font-size:14px;">${extrasText}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;color:#6b7280;font-size:14px;">Total</td>
                        <td style="padding:12px 0;text-align:right;font-weight:bold;font-size:20px;color:#22c55e;">$${booking.totalPrice ?? ""}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Note Box -->
              <div style="background-color:#fef3c7;padding:16px 20px;border-radius:8px;border-left:4px solid #f59e0b;margin-bottom:30px;">
                <p style="margin:0;font-size:14px;color:#92400e;"><strong>Note:</strong> Please allow us a 1-hour window to deal with traffic, parking, and other surprises.</p>
              </div>
              
              <!-- Important Reminders -->
              <h3 style="margin:30px 0 15px 0;color:${primaryColor};font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid ${primaryColor};padding-bottom:10px;">Important Reminders</h3>
              <ul style="margin:0 0 25px 0;padding-left:20px;color:#4b5563;font-size:14px;">
                <li style="margin-bottom:10px;">If you would like to add extras not included in your cleaning, please notify us as quickly as possible.</li>
                <li style="margin-bottom:10px;">Communicate your expectations with your cleaner when they arrive. Please do a review with the cleaner(s) prior to letting them go.</li>
                <li style="margin-bottom:10px;">Make sure the cleaner(s) has space to clean. Children, pets, and other adults in the way can be hazardous.</li>
                <li style="margin-bottom:10px;">We recommend minimizing clutter as much as possible. The cleaners will need access to surfaces to clean.</li>
                <li style="margin-bottom:10px;"><strong>Please be home when the cleaners finish cleaning.</strong> If the client is not home for the final walkthrough, they surrender the right to a reclean.</li>
              </ul>
              
              <!-- Pricing & Adjustments -->
              <h3 style="margin:30px 0 15px 0;color:${primaryColor};font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid ${primaryColor};padding-bottom:10px;">Pricing &amp; Adjustments</h3>
              <p style="margin:0 0 10px 0;font-size:14px;color:#4b5563;">The price quoted is based on the home being accurately represented at the time of booking.</p>
              <p style="margin:0 0 25px 0;font-size:14px;color:#4b5563;">If the cleaner determines a more in-depth cleaning is needed, the cost may be subject to increase. <strong>This will never be done without a conversation and your consent.</strong></p>
              
              <!-- Cancellation Policy -->
              <h3 style="margin:30px 0 15px 0;color:${primaryColor};font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid ${primaryColor};padding-bottom:10px;">Cancellation &amp; Rescheduling Policy</h3>
              <p style="margin:0 0 10px 0;font-size:14px;color:#4b5563;">We enforce a <strong>1 full business day</strong> cancellation or modification rule.</p>
              <ul style="margin:0 0 25px 0;padding-left:20px;color:#4b5563;font-size:14px;">
                <li style="margin-bottom:8px;">More than 1 full business day notice → <strong>No fee</strong></li>
                <li style="margin-bottom:8px;">Less than 1 full business day notice → <strong>$50 rebooking/cancellation fee</strong></li>
                <li style="margin-bottom:8px;">Less than 24 hours before appointment OR unable to gain access → <strong>100% of appointment cost</strong></li>
              </ul>
              
              <!-- Payment Info -->
              <h3 style="margin:30px 0 15px 0;color:${primaryColor};font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid ${primaryColor};padding-bottom:10px;">Payment Information</h3>
              <ul style="margin:0 0 25px 0;padding-left:20px;color:#4b5563;font-size:14px;">
                <li style="margin-bottom:8px;">We collect your credit card information the day you book with us.</li>
                <li style="margin-bottom:8px;">Funds will not be withdrawn until <strong>after</strong> your appointment has been completed.</li>
                <li style="margin-bottom:8px;">A hold will be put on the cost of your appointment 24 hours before your booking to ensure funds are available.</li>
              </ul>
              
              <!-- Satisfaction Policy -->
              <h3 style="margin:30px 0 15px 0;color:${primaryColor};font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid ${primaryColor};padding-bottom:10px;">Satisfaction Policy</h3>
              <ul style="margin:0 0 25px 0;padding-left:20px;color:#4b5563;font-size:14px;">
                <li style="margin-bottom:8px;">If you are not happy with the service, you have a <strong>24-hour period</strong> to notify us.</li>
                <li style="margin-bottom:8px;">The cleaner(s) will return to handle any issues at no additional charge.</li>
                <li style="margin-bottom:8px;">There are no refunds for any services provided.</li>
              </ul>
              
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
              
              <p style="margin:0 0 10px 0;text-align:center;font-size:14px;color:#6b7280;">
                Questions? Reply to this email or contact us anytime.
              </p>
              <p style="margin:0;text-align:center;font-size:16px;font-weight:bold;color:${primaryColor};">
                Thank you for choosing ${companyName}!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:#1f2937;padding:25px;text-align:center;">
              <p style="color:#ffffff;font-size:16px;font-weight:600;margin:0 0 5px 0;">${companyName}</p>
              <p style="color:#9ca3af;font-size:12px;margin:0;">
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

    // Send email with organization's verified domain
    let customerEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: formatEmailFrom(emailSettings),
        to: [customerEmail],
        reply_to: getReplyTo(emailSettings),
        subject: `Booking Confirmed - ${booking.appointmentDate || ""}`,
        html: emailHtml,
      }),
    });

    let customerData: any = null;
    try {
      customerData = await customerEmailResponse.json();
    } catch (_e) {
      customerData = null;
    }

    // If domain not verified, return helpful error
    if (!customerEmailResponse.ok && customerData?.name === 'validation_error' && customerData?.message?.includes('not verified')) {
      const domain = senderEmail.split('@')[1];
      console.error(`Domain ${domain} is not verified on Resend`);
      throw new Error(`Your email domain (${domain}) is not verified. Please verify it at https://resend.com/domains to send emails.`);
    }

    if (!customerEmailResponse.ok) {
      console.error("Resend API error (customer):", { status: customerEmailResponse.status, data: customerData });
      throw new Error(customerData?.message || `Failed to send customer email (status ${customerEmailResponse.status})`);
    }

    console.log("Customer email sent successfully:", customerData);

    // Send notification to admin
    const adminNotificationHtml = `
      <h2>New Booking Received</h2>
      <p><strong>Customer:</strong> ${customerName || "N/A"}</p>
      <p><strong>Email:</strong> ${customerEmail}</p>
      <p><strong>Phone:</strong> ${booking.customerPhone || "N/A"}</p>
      <p><strong>Service:</strong> ${booking.serviceName || "N/A"}</p>
      <p><strong>Date:</strong> ${booking.appointmentDate || "N/A"}</p>
      <p><strong>Time:</strong> ${booking.appointmentTime || "N/A"}</p>
      <p><strong>Address:</strong> ${fullAddress || "N/A"}</p>
      <p><strong>Total:</strong> $${booking.totalPrice ?? "N/A"}</p>
      <p><strong>Extras:</strong> ${extrasText}</p>
    `;

    try {
      // Send admin notification using the org's sender email
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: `${companyName} Booking System <${senderEmail}>`,
          to: [senderEmail],
          subject: `New Booking - ${booking.serviceName || "Cleaning"} - ${booking.appointmentDate || ""}`,
          html: adminNotificationHtml,
        }),
      });
      console.log("Admin notification sent successfully");
    } catch (adminError) {
      console.error("Failed to send admin notification:", adminError);
      // Don't throw - admin notification is secondary
    }

    // Send SMS confirmation if enabled
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sendBookingSMS(
        supabase,
        booking.organizationId,
        booking.customerPhone || "",
        customerName,
        booking.appointmentDate || "",
        booking.appointmentTime || "",
        booking.serviceName || "Cleaning",
        companyName
      );
    }

    // Audit log: successful email send
    logAudit({
      action: AuditActions.EMAIL_BOOKING_CONFIRMATION,
      organizationId: booking.organizationId,
      resourceType: 'customer',
      resourceId: customerEmail,
      details: { confirmationNumber: booking.confirmationNumber, service: booking.serviceName },
      success: true,
    });

    return new Response(JSON.stringify({ success: true, emailId: customerData?.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-booking-email function:", error);
    
    // Audit log: failed email send
    logAudit({
      action: AuditActions.EMAIL_BOOKING_CONFIRMATION,
      organizationId: (await req.json().catch(() => ({}))).organizationId || 'unknown',
      success: false,
      error: error.message,
    });

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
