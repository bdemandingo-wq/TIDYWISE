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
              from: "TidyWise <onboarding@resend.dev>",
              to: [booking.customer.email],
              subject: `Reminder: Your ${serviceName} is in ${window.label}!`,
              html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Appointment Reminder</h1>
                  </div>
                  
                  <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
                    <p style="font-size: 16px; margin-top: 0;">Hi ${customerName},</p>
                    
                    <p style="font-size: 16px;">This is a friendly reminder that your <strong>${serviceName}</strong> is scheduled in <strong>${window.label}</strong>.</p>
                    
                    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
                      <h3 style="margin-top: 0; color: #3b82f6;">Appointment Details</h3>
                      <p style="margin: 8px 0;"><strong>📅 Date:</strong> ${formattedDate}</p>
                      <p style="margin: 8px 0;"><strong>🕐 Time:</strong> ${formattedTime}</p>
                      <p style="margin: 8px 0;"><strong>🏠 Address:</strong> ${address}</p>
                      <p style="margin: 8px 0;"><strong>📋 Service:</strong> ${serviceName}</p>
                      ${booking.staff ? `<p style="margin: 8px 0;"><strong>👤 Cleaner:</strong> ${booking.staff.name}</p>` : ''}
                      <p style="margin: 8px 0;"><strong>💰 Total:</strong> $${booking.total_amount}</p>
                    </div>
                    
                    <p style="font-size: 14px; color: #64748b;">Please ensure access to the property is available at the scheduled time. If you need to reschedule or have any questions, please contact us.</p>
                    
                    <p style="font-size: 16px; margin-bottom: 0;">Thank you for choosing TidyWise!</p>
                  </div>
                  
                  <div style="background: #1e293b; padding: 20px; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="color: #94a3b8; margin: 0; font-size: 12px;">
                      © ${new Date().getFullYear()} TidyWise. All rights reserved.
                    </p>
                  </div>
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
