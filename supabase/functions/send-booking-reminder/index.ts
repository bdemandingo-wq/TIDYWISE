import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Time windows in hours
const REMINDER_WINDOWS = [
  { hours: 120, label: '5 days' },
  { hours: 3, label: '3 hours' },
  { hours: 1, label: '1 hour' },
];

// Minimalistic email template
const getReminderEmailHtml = (
  customerName: string,
  serviceName: string,
  formattedDate: string,
  formattedTime: string,
  address: string,
  totalAmount: number | null,
  companyName: string,
  staffName?: string,
  windowLabel?: string
) => {
  const timeLabel = windowLabel ? `Your appointment is in ${windowLabel}` : 'Upcoming Appointment';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Reminder</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#333333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td style="padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#1e5bb0;padding:25px;text-align:center;">
              <div style="font-size:28px;font-weight:bold;color:#ffffff;">${companyName}</div>
              <p style="color:#ffffff;font-size:13px;margin:5px 0 0 0;">Professional Cleaning Services</p>
            </td>
          </tr>
          
          <!-- Reminder Banner -->
          <tr>
            <td style="background-color:#f59e0b;padding:12px;text-align:center;">
              <span style="color:#ffffff;font-size:16px;font-weight:600;">${timeLabel}</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px;margin:0 0 15px 0;">Hi ${customerName},</p>
              
              <p style="margin:0 0 25px 0;">This is a friendly reminder about your upcoming <strong>${serviceName}</strong> appointment.</p>
              
              <!-- Appointment Details -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9f9f9;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 15px 0;color:#1e5bb0;font-size:14px;text-transform:uppercase;">Appointment Details</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e0e0e0;color:#666666;font-size:14px;">Date</td>
                        <td style="padding:10px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;font-size:14px;color:#333333;">${formattedDate}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e0e0e0;color:#666666;font-size:14px;">Time</td>
                        <td style="padding:10px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;font-size:14px;color:#333333;">${formattedTime}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e0e0e0;color:#666666;font-size:14px;">Address</td>
                        <td style="padding:10px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;font-size:14px;color:#333333;">${address}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;${staffName || totalAmount !== null ? 'border-bottom:1px solid #e0e0e0;' : ''}color:#666666;font-size:14px;">Service</td>
                        <td style="padding:10px 0;${staffName || totalAmount !== null ? 'border-bottom:1px solid #e0e0e0;' : ''}text-align:right;font-weight:600;font-size:14px;color:#333333;">${serviceName}</td>
                      </tr>
                      ${staffName ? `
                      <tr>
                        <td style="padding:10px 0;${totalAmount !== null ? 'border-bottom:1px solid #e0e0e0;' : ''}color:#666666;font-size:14px;">Cleaner</td>
                        <td style="padding:10px 0;${totalAmount !== null ? 'border-bottom:1px solid #e0e0e0;' : ''}text-align:right;font-weight:600;font-size:14px;color:#333333;">${staffName}</td>
                      </tr>
                      ` : ''}
                      ${totalAmount !== null ? `
                      <tr>
                        <td style="padding:10px 0;color:#666666;font-size:14px;">Total</td>
                        <td style="padding:10px 0;text-align:right;font-weight:bold;font-size:18px;color:#3fa34d;">$${totalAmount}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin:0 0 10px 0;background-color:#e8f4fd;padding:12px;border-radius:6px;font-size:14px;color:#333333;">
                <strong>Please ensure</strong> access to the property is available at the scheduled time.
              </p>
              
              <p style="margin:20px 0 0 0;font-size:14px;color:#666666;text-align:center;">
                Need to reschedule? Reply to this email or contact us.
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
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY");
    }

    // Parse payload to get organizationId
    let payload: any = null;
    try {
      const text = await req.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    const isManualSend = !!payload?.customerEmail;
    const organizationId = payload?.organizationId;

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!organizationId) {
      console.error("Missing organizationId - cannot send reminder without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch business settings for the SPECIFIC organization only
    let senderEmail = "";
    let companyName = "";
    
    // ONLY query settings for the specific organization - NO FALLBACK
    const { data: settings, error: settingsError } = await supabase
      .from('business_settings')
      .select('company_email, company_name')
      .eq('organization_id', organizationId)
      .maybeSingle();
    
    if (settingsError) {
      console.error("Error fetching organization settings:", settingsError);
    }
    
    if (!settings || !settings.company_email || !settings.company_name) {
      console.error("Organization settings not configured for org:", organizationId);
      return new Response(JSON.stringify({ 
        error: "Organization email settings not configured. Please set up your company email and name in Settings." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    senderEmail = settings.company_email;
    companyName = settings.company_name;
    
    console.log("Using organization settings - sender:", senderEmail, "company:", companyName);

    if (isManualSend) {
      const scheduledDate = payload?.scheduledAt ? new Date(payload.scheduledAt) : null;
      const formattedDate = scheduledDate
        ? scheduledDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Your scheduled date';
      const formattedTime = scheduledDate
        ? scheduledDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : 'Your scheduled time';

      const customerName = payload?.customerName || 'there';
      const serviceName = payload?.serviceName || 'Cleaning Service';
      const address = payload?.address || 'Address on file';
      const totalAmount = typeof payload?.totalAmount === 'number' ? payload.totalAmount : null;

      console.log(
        `Manual reminder requested for bookingId=${payload?.bookingId ?? 'n/a'} to=${payload.customerEmail} org=${organizationId}`,
      );

      const emailHtml = getReminderEmailHtml(
        customerName,
        serviceName,
        formattedDate,
        formattedTime,
        address,
        totalAmount,
        companyName,
        undefined,
        undefined
      );

      let res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${companyName} <${senderEmail}>`,
          to: [payload.customerEmail],
          reply_to: senderEmail,
          subject: `Reminder: Your ${serviceName} on ${formattedDate}`,
          html: emailHtml,
        }),
      });

      let data = await res.json();
      
      // If domain not verified, return helpful error
      if (!res.ok && data?.name === 'validation_error' && data?.message?.includes('not verified')) {
        const domain = senderEmail.split('@')[1];
        console.error(`Domain ${domain} is not verified on Resend`);
        throw new Error(`Your email domain (${domain}) is not verified. Please verify it at https://resend.com/domains to send emails.`);
      }
      
      if (!res.ok) {
        console.error("Resend API error:", data);
        throw new Error(data?.message || "Failed to send reminder email");
      }

      // Optional: validate booking exists
      if (payload?.bookingId) {
        const { error: bookingError } = await supabase
          .from('bookings')
          .select('id')
          .eq('id', payload.bookingId)
          .maybeSingle();
        if (bookingError) {
          console.warn('Manual reminder: booking lookup failed:', bookingError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Sent 1 reminder",
          reminders: [payload?.bookingId ?? "manual"],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Batch scheduled reminders - filter by organization_id
    const now = new Date();
    const sentReminders: string[] = [];

    for (const window of REMINDER_WINDOWS) {
      const windowStart = new Date(now.getTime() + (window.hours * 60 - 15) * 60 * 1000);
      const windowEnd = new Date(now.getTime() + (window.hours * 60 + 15) * 60 * 1000);

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          service:services(*),
          staff:staff(*)
        `)
        .eq('organization_id', organizationId) // Filter by organization
        .gte('scheduled_at', windowStart.toISOString())
        .lte('scheduled_at', windowEnd.toISOString())
        .in('status', ['pending', 'confirmed'])
        .not('customer_id', 'is', null);

      if (error) {
        console.error('Error fetching bookings:', error);
        continue;
      }

      console.log(`Found ${bookings?.length || 0} bookings for ${window.label} reminder in org ${organizationId}`);

      for (const booking of bookings || []) {
        if (!booking.customer?.email) continue;

        const scheduledDate = new Date(booking.scheduled_at);
        const formattedDate = scheduledDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        const customerName = `${booking.customer.first_name} ${booking.customer.last_name}`;
        const serviceName = booking.service?.name || 'Cleaning Service';
        const address = [booking.address, booking.city, booking.state, booking.zip_code]
          .filter(Boolean)
          .join(', ') || 'Address on file';

        try {
          const emailHtml = getReminderEmailHtml(
            customerName,
            serviceName,
            formattedDate,
            formattedTime,
            address,
            booking.total_amount,
            companyName,
            booking.staff?.name,
            window.label
          );

          let res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: `${companyName} <${senderEmail}>`,
              to: [booking.customer.email],
              reply_to: senderEmail,
              subject: `Reminder: Your ${serviceName} is in ${window.label}!`,
              html: emailHtml,
            }),
          });

          let data = await res.json();

          // If domain not verified, log error and skip
          if (!res.ok && data?.name === 'validation_error' && data?.message?.includes('not verified')) {
            const domain = senderEmail.split('@')[1];
            console.error(`Domain ${domain} is not verified on Resend - skipping reminder for booking #${booking.booking_number}`);
            continue;
          }

          if (!res.ok) {
            console.error("Resend API error:", data);
            throw new Error(data.message || "Failed to send email");
          }

          sentReminders.push(`${booking.booking_number} (${window.label})`);
          console.log(`Sent ${window.label} reminder for booking #${booking.booking_number}`);
        } catch (emailError: any) {
          console.error(`Failed to send reminder for booking #${booking.booking_number}:`, emailError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${sentReminders.length} reminders`,
        reminders: sentReminders 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-booking-reminder function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
