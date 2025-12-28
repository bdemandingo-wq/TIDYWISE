import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyCleanersRequest {
  staffEmails?: string[];
  jobDetails: {
    booking_id: string;
    booking_number: number;
    service_name: string;
    scheduled_date: string;
    scheduled_time: string;
    address: string;
    duration: number;
    total_amount: number;
  };
  companyName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { staffEmails, jobDetails, companyName }: NotifyCleanersRequest = await req.json();

    console.log("Notifying cleaners about new job:", jobDetails);

    // Get all active staff members with their rates
    const { data: staffMembers, error: staffError } = await supabase
      .from("staff")
      .select("id, name, email, hourly_rate, percentage_rate")
      .eq("is_active", true);

    if (staffError) {
      console.error("Error fetching staff:", staffError);
      throw staffError;
    }

    if (!staffMembers || staffMembers.length === 0) {
      console.log("No active staff members to notify");
      return new Response(
        JSON.stringify({ success: true, message: "No staff to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${staffMembers.length} active staff members`);

    // Create in-app notifications for all staff
    const notifications = staffMembers.map((staff) => {
      // Calculate potential earnings for this staff member
      let potentialPay = 0;
      if (staff.percentage_rate && staff.percentage_rate > 0) {
        potentialPay = (jobDetails.total_amount * staff.percentage_rate) / 100;
      } else if (staff.hourly_rate && staff.hourly_rate > 0) {
        potentialPay = staff.hourly_rate * 5; // Default 5 hours
      }

      return {
        staff_id: staff.id,
        booking_id: jobDetails.booking_id,
        title: "New Job Available!",
        message: `${jobDetails.service_name} on ${jobDetails.scheduled_date} at ${jobDetails.scheduled_time}. Location: ${jobDetails.address}. Potential pay: $${potentialPay.toFixed(2)}`,
        type: "new_job",
      };
    });

    const { error: notifError } = await supabase
      .from("cleaner_notifications")
      .insert(notifications);

    if (notifError) {
      console.error("Error creating notifications:", notifError);
      throw notifError;
    }

    console.log(`Created ${notifications.length} in-app notifications`);

    // Send email notifications if Resend is configured
    let emailsSent = 0;
    let emailsFailed = 0;

    if (RESEND_API_KEY) {
      const emailPromises = staffMembers
        .filter(staff => staff.email)
        .map(async (staff) => {
          let potentialPay = 0;
          if (staff.percentage_rate && staff.percentage_rate > 0) {
            potentialPay = (jobDetails.total_amount * staff.percentage_rate) / 100;
          } else if (staff.hourly_rate && staff.hourly_rate > 0) {
            potentialPay = staff.hourly_rate * 5;
          }

          const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 24px;">🎉 New Job Available!</h1>
      <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">A cleaning job is waiting for you</p>
    </div>
    
    <div style="padding: 30px;">
      <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 8px; color: #166534; font-size: 14px; font-weight: 600;">POTENTIAL EARNINGS</p>
        <p style="margin: 0; color: #166534; font-size: 36px; font-weight: bold;">$${potentialPay.toFixed(2)}</p>
      </div>

      <h2 style="margin: 0 0 16px; color: #111827; font-size: 18px;">Job Details</h2>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 40%;">Booking #</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${jobDetails.booking_number}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Service</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${jobDetails.service_name}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Date</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${jobDetails.scheduled_date}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Time</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${jobDetails.scheduled_time}</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Duration</td>
          <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 500;">${jobDetails.duration} minutes</td>
        </tr>
        <tr>
          <td style="padding: 12px 0; color: #6b7280;">Location</td>
          <td style="padding: 12px 0; color: #111827; font-weight: 500;">${jobDetails.address}</td>
        </tr>
      </table>

      <div style="margin-top: 30px; text-align: center;">
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 16px;">First come, first served! Log in to the Staff Portal to claim this job.</p>
      </div>
    </div>

    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #9ca3af; font-size: 12px;">
        Sent by ${companyName}<br>
        You're receiving this because you're registered as a cleaner
      </p>
    </div>
  </div>
</body>
</html>`;

          try {
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: `${companyName} <support@tidywisecleaning.com>`,
                to: [staff.email],
                subject: `🎉 New Job Available - $${potentialPay.toFixed(2)} Potential Earnings`,
                html: emailHtml,
              }),
            });

            if (response.ok) {
              console.log(`Email sent to ${staff.email}`);
              return { success: true };
            } else {
              console.error(`Failed to send email to ${staff.email}`);
              return { success: false };
            }
          } catch (error) {
            console.error(`Error sending email to ${staff.email}:`, error);
            return { success: false };
          }
        });

      const results = await Promise.all(emailPromises);
      emailsSent = results.filter(r => r.success).length;
      emailsFailed = results.filter(r => !r.success).length;

      console.log(`Emails sent: ${emailsSent}, failed: ${emailsFailed}`);
    } else {
      console.log("Resend API key not configured, skipping email notifications");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications: notifications.length,
        emailsSent,
        emailsFailed,
        message: `Notified ${staffMembers.length} cleaner(s)` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending notifications:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
