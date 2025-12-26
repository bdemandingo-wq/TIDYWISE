import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  organizationId?: string;
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

    console.log("Sending booking confirmation email to:", customerEmail);

    // Fetch business settings to get sender email and company name
    let senderEmail = "support@jointidywise.com";
    let companyName = "TidyWise";
    
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && booking.organizationId) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: settings } = await supabase
        .from('business_settings')
        .select('company_email, company_name')
        .eq('organization_id', booking.organizationId)
        .maybeSingle();
      
      if (settings?.company_email) {
        senderEmail = settings.company_email;
        console.log("Using custom sender email:", senderEmail);
      }
      if (settings?.company_name) {
        companyName = settings.company_name;
      }
    }

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

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#333333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td style="padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#1e5bb0;padding:30px;text-align:center;">
              <div style="font-size:32px;font-weight:bold;color:#ffffff;">
                ${companyName}
              </div>
              <p style="color:#ffffff;font-size:14px;margin:5px 0 0 0;">Professional Cleaning Services</p>
            </td>
          </tr>
          
          <!-- Success Banner -->
          <tr>
            <td style="background-color:#3fa34d;padding:15px;text-align:center;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;">✓ Booking Confirmed!</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px;margin:0 0 15px 0;">Hi ${customerName || "there"},</p>
              
              <p style="margin:0 0 15px 0;">Thank you very much for booking with us. <strong>You're all set!</strong></p>
              
              <p style="margin:0 0 20px 0;">Please double check the date, time, and address to make sure it's correct.</p>
              
              <!-- Appointment Details -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9f9f9;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 15px 0;color:#1e5bb0;font-size:16px;">APPOINTMENT DETAILS</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Service</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${booking.serviceName || "Cleaning Service"}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Date</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${booking.appointmentDate || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Time</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${booking.appointmentTime || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Address</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${fullAddress || booking.address || ""}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Home Size</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${booking.homeSize || "Not specified"}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Extras</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${extrasText}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#666;">Total</td>
                        <td style="padding:8px 0;text-align:right;font-weight:bold;font-size:18px;color:#3fa34d;">$${booking.totalPrice ?? ""}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin:0 0 20px 0;background-color:#fff3cd;padding:12px;border-radius:6px;border-left:4px solid #ffc107;">
                <strong>Note:</strong> Please allow us a 1-hour window to deal with traffic, parking, and other surprises.
              </p>
              
              <!-- Important Reminders -->
              <h3 style="margin:25px 0 15px 0;color:#1e5bb0;font-size:16px;border-bottom:2px solid #1e5bb0;padding-bottom:8px;">IMPORTANT REMINDERS</h3>
              <ul style="margin:0 0 20px 0;padding-left:20px;">
                <li style="margin-bottom:10px;">If you would like to add extras not included in your cleaning, please notify us as quickly as possible.</li>
                <li style="margin-bottom:10px;">Communicate your expectations with your cleaner when they arrive. Please do a review with the cleaner(s) prior to letting them go. They are paid by the job and will not leave until you are satisfied.</li>
                <li style="margin-bottom:10px;">Make sure the cleaner(s) has space to clean. Children, pets, and other adults in the way can be hazardous.</li>
                <li style="margin-bottom:10px;">We recommend minimizing clutter as much as possible. The cleaners will need access to surfaces to clean.</li>
                <li style="margin-bottom:10px;"><strong>Please be home when the cleaners finish cleaning.</strong> If the client is not home for the final walkthrough, they surrender the right to a reclean.</li>
              </ul>
              
              <!-- Pricing & Adjustments -->
              <h3 style="margin:25px 0 15px 0;color:#1e5bb0;font-size:16px;border-bottom:2px solid #1e5bb0;padding-bottom:8px;">PRICING &amp; ADJUSTMENTS</h3>
              <p style="margin:0 0 15px 0;">The price quoted is based on the home being accurately represented at the time of booking.</p>
              <p style="margin:0 0 20px 0;">At times, it is impossible for us to know if a home will require a more in-depth cleaning until the cleaner arrives on-site. If the cleaner determines a more in-depth cleaning is needed, the cost may be subject to increase. <strong>This will never be done without a conversation and your consent.</strong></p>
              
              <!-- Cancellation Policy -->
              <h3 style="margin:25px 0 15px 0;color:#1e5bb0;font-size:16px;border-bottom:2px solid #1e5bb0;padding-bottom:8px;">CANCELLATION &amp; RESCHEDULING POLICY</h3>
              <p style="margin:0 0 10px 0;">We enforce a <strong>1 full business day</strong> cancellation or modification rule.</p>
              <ul style="margin:0 0 20px 0;padding-left:20px;">
                <li style="margin-bottom:8px;">More than 1 full business day notice → <strong>No fee</strong></li>
                <li style="margin-bottom:8px;">Less than 1 full business day notice → <strong>$50 rebooking/cancellation fee</strong></li>
                <li style="margin-bottom:8px;">Less than 24 hours before appointment OR unable to gain access → <strong>100% of appointment cost</strong></li>
                <li style="margin-bottom:8px;">No running water or electricity on-site → <strong>100% of appointment cost</strong></li>
              </ul>
              
              <!-- Payment Info -->
              <h3 style="margin:25px 0 15px 0;color:#1e5bb0;font-size:16px;border-bottom:2px solid #1e5bb0;padding-bottom:8px;">PAYMENT INFORMATION</h3>
              <ul style="margin:0 0 20px 0;padding-left:20px;">
                <li style="margin-bottom:8px;">We collect your credit card information the day you book with us.</li>
                <li style="margin-bottom:8px;">Funds will not be withdrawn until <strong>after</strong> your appointment has been completed.</li>
                <li style="margin-bottom:8px;">A hold will be put on the cost of your appointment 24 hours before your booking to ensure funds are available.</li>
              </ul>
              
              <!-- Satisfaction Policy -->
              <h3 style="margin:25px 0 15px 0;color:#1e5bb0;font-size:16px;border-bottom:2px solid #1e5bb0;padding-bottom:8px;">SATISFACTION POLICY</h3>
              <ul style="margin:0 0 20px 0;padding-left:20px;">
                <li style="margin-bottom:8px;">If you are not happy with the service, you have a <strong>24-hour period</strong> to notify us.</li>
                <li style="margin-bottom:8px;">The cleaner(s) will return to handle any issues at no additional charge, provided there has been a post-clean walkthrough completed.</li>
                <li style="margin-bottom:8px;">There are no refunds for any services provided.</li>
                <li style="margin-bottom:8px;">Cleaners will not move furniture or appliances over 20 lbs for safety and insurance reasons.</li>
              </ul>
              
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

    // Send to customer
    const customerEmailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName} <${senderEmail}>`,
        to: [customerEmail],
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
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${companyName} Booking System <${senderEmail}>`,
          to: ["support@tidywisecleaning.com"],
          subject: `New Booking - ${booking.serviceName || "Cleaning"} - ${booking.appointmentDate || ""}`,
          html: adminNotificationHtml,
        }),
      });
      console.log("Admin notification sent successfully");
    } catch (adminError) {
      console.error("Failed to send admin notification:", adminError);
      // Don't throw - admin notification is secondary
    }

    return new Response(JSON.stringify({ success: true, emailId: customerData?.id }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-booking-email function:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
