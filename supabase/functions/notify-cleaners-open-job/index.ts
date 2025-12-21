import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyCleanersRequest {
  staffEmails: string[];
  jobDetails: {
    booking_number: number;
    service_name: string;
    scheduled_date: string;
    scheduled_time: string;
    address: string;
    duration: number;
    potential_earnings: number;
  };
  companyName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { staffEmails, jobDetails, companyName }: NotifyCleanersRequest = await req.json();

    if (!staffEmails || staffEmails.length === 0) {
      return new Response(
        JSON.stringify({ error: "No staff emails provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        <p style="margin: 0; color: #166534; font-size: 36px; font-weight: bold;">$${jobDetails.potential_earnings.toFixed(2)}</p>
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
        <a href="#" style="display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Claim This Job</a>
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
</html>
    `;

    // Send to all cleaners
    const emailPromises = staffEmails.map(email => 
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${companyName} <onboarding@resend.dev>`,
          to: [email],
          subject: `🎉 New Job Available - $${jobDetails.potential_earnings.toFixed(2)} Potential Earnings`,
          html: emailHtml,
        }),
      })
    );

    const results = await Promise.allSettled(emailPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Notifications sent: ${successful} successful, ${failed} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successful,
        failed: failed,
        message: `Notified ${successful} cleaner(s)` 
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
