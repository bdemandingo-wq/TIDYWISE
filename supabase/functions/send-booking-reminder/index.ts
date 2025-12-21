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
  { hours: 120, label: '5 days' },    // 5 days = 120 hours
  { hours: 3, label: '3 hours' },      // 3 hours
  { hours: 1, label: '1 hour' },       // 1 hour
];

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const sentReminders: string[] = [];

    for (const window of REMINDER_WINDOWS) {
      // Calculate the time window for this reminder (±15 minutes)
      const windowStart = new Date(now.getTime() + (window.hours * 60 - 15) * 60 * 1000);
      const windowEnd = new Date(now.getTime() + (window.hours * 60 + 15) * 60 * 1000);

      // Fetch bookings in this window
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          service:services(*),
          staff:staff(*)
        `)
        .gte('scheduled_at', windowStart.toISOString())
        .lte('scheduled_at', windowEnd.toISOString())
        .in('status', ['pending', 'confirmed'])
        .not('customer_id', 'is', null);

      if (error) {
        console.error('Error fetching bookings:', error);
        continue;
      }

      console.log(`Found ${bookings?.length || 0} bookings for ${window.label} reminder`);

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
          // Send email using Resend API directly
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "TidyWise Cleaning <onboarding@resend.dev>",
              to: [booking.customer.email],
              subject: `⏰ Reminder: Your ${serviceName} is in ${window.label}!`,
              html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Appointment Reminder</title>
                </head>
                <body style="margin: 0; padding: 0; background-color: #f0f4f8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0f4f8;">
                    <tr>
                      <td style="padding: 40px 20px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);">
                          
                          <!-- Header with Logo -->
                          <tr>
                            <td style="background: linear-gradient(135deg, #1e5bb0 0%, #2d7dd2 50%, #3fa34d 100%); padding: 40px 40px 30px 40px; text-align: center;">
                              <div style="font-size: 48px; font-weight: bold; color: #ffffff; letter-spacing: -2px; margin-bottom: 8px;">
                                <span style="color: #ffffff;">Tidy</span><span style="color: #8cff8c;">Wise</span>
                              </div>
                              <p style="color: rgba(255, 255, 255, 0.9); font-size: 14px; margin: 0; letter-spacing: 2px; text-transform: uppercase;">Professional Cleaning Services</p>
                            </td>
                          </tr>
                          
                          <!-- Reminder Banner -->
                          <tr>
                            <td style="background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); padding: 20px; text-align: center;">
                              <span style="color: #ffffff; font-size: 20px; font-weight: 600;">⏰ Appointment in ${window.label}!</span>
                            </td>
                          </tr>
                          
                          <!-- Main Content -->
                          <tr>
                            <td style="padding: 40px;">
                              <p style="font-size: 18px; color: #1a1a2e; margin: 0 0 20px 0;">Hi ${customerName},</p>
                              <p style="font-size: 16px; color: #4a4a68; line-height: 1.6; margin: 0 0 30px 0;">
                                Just a friendly reminder that your <strong>${serviceName}</strong> is coming up soon. We can't wait to make your space shine!
                              </p>
                              
                              <!-- Countdown Box -->
                              <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 30px; border: 2px solid #f59e0b;">
                                <span style="color: #92400e; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your appointment is in</span>
                                <div style="color: #b45309; font-size: 36px; font-weight: bold; margin-top: 5px;">${window.label}</div>
                              </div>
                              
                              <!-- Appointment Details Card -->
                              <div style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
                                <h3 style="color: #1e5bb0; font-size: 16px; margin: 0 0 20px 0; text-transform: uppercase; letter-spacing: 1px;">Appointment Details</h3>
                                
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                  <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                                      <span style="color: #64748b; font-size: 14px;">📅 Date</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                                      <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${formattedDate}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                                      <span style="color: #64748b; font-size: 14px;">🕐 Time</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                                      <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${formattedTime}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                                      <span style="color: #64748b; font-size: 14px;">🏠 Address</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                                      <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${address}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                                      <span style="color: #64748b; font-size: 14px;">📋 Service</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                                      <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${serviceName}</span>
                                    </td>
                                  </tr>
                                  ${booking.staff ? `
                                  <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                                      <span style="color: #64748b; font-size: 14px;">👤 Cleaner</span>
                                    </td>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                                      <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${booking.staff.name}</span>
                                    </td>
                                  </tr>
                                  ` : ''}
                                  <tr>
                                    <td style="padding: 12px 0;">
                                      <span style="color: #64748b; font-size: 14px;">💰 Total</span>
                                    </td>
                                    <td style="padding: 12px 0; text-align: right;">
                                      <span style="color: #3fa34d; font-weight: bold; font-size: 18px;">$${booking.total_amount}</span>
                                    </td>
                                  </tr>
                                </table>
                              </div>
                              
                              <!-- Important Note -->
                              <div style="background: #f0f9ff; border-left: 4px solid #1e5bb0; padding: 15px 20px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
                                <p style="color: #1e40af; font-size: 14px; margin: 0; line-height: 1.5;">
                                  <strong>📍 Please ensure:</strong><br>
                                  Access to the property is available at the scheduled time.
                                </p>
                              </div>
                              
                              <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 20px 0 0 0; text-align: center;">
                                Need to reschedule? Reply to this email or contact us.<br>
                                We're happy to help!
                              </p>
                            </td>
                          </tr>
                          
                          <!-- Footer -->
                          <tr>
                            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%); padding: 30px 40px; text-align: center;">
                              <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 5px 0;">TidyWise Cleaning</p>
                              <p style="color: #94a3b8; font-size: 13px; margin: 0 0 15px 0;">Making spaces sparkle, one clean at a time</p>
                              <p style="color: #64748b; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} TidyWise. All rights reserved.
                              </p>
                            </td>
                          </tr>
                          
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
              `,
            }),
          });

          const data = await res.json();

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
