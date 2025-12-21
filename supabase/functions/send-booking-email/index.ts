import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
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
                
                <!-- Success Banner -->
                <tr>
                  <td style="background-color: #3fa34d; padding: 20px; text-align: center;">
                    <span style="color: #ffffff; font-size: 20px; font-weight: 600;">✨ Booking Confirmed!</span>
                  </td>
                </tr>
                
                <!-- Main Content -->
                <tr>
                  <td style="padding: 40px;">
                    <p style="font-size: 18px; color: #1a1a2e; margin: 0 0 20px 0;">Hi ${customerName || "there"},</p>
                    <p style="font-size: 16px; color: #4a4a68; line-height: 1.6; margin: 0 0 30px 0;">
                      Thank you for choosing TidyWise! Your appointment has been successfully scheduled. We're excited to help make your space sparkle!
                    </p>
                    
                    <!-- Confirmation Badge -->
                    <div style="background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%); border-left: 4px solid #3fa34d; padding: 15px 20px; border-radius: 0 8px 8px 0; margin-bottom: 30px;">
                      <span style="color: #2e7d32; font-weight: 600; font-size: 14px;">CONFIRMATION NUMBER</span>
                      <div style="color: #1b5e20; font-size: 24px; font-weight: bold; margin-top: 5px;">${booking.confirmationNumber || ""}</div>
                    </div>
                    
                    <!-- Appointment Details Card -->
                    <div style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 12px; padding: 25px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
                      <h3 style="color: #1e5bb0; font-size: 16px; margin: 0 0 20px 0; text-transform: uppercase; letter-spacing: 1px;">Appointment Details</h3>
                      
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Service</span>
                          </td>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${booking.serviceName || "Cleaning Service"}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">Home Size</span>
                          </td>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${booking.homeSize || "Not specified"}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">📅 Date</span>
                          </td>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${booking.appointmentDate || ""}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">🕐 Time</span>
                          </td>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${booking.appointmentTime || ""}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                            <span style="color: #64748b; font-size: 14px;">🏠 Address</span>
                          </td>
                          <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                            <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${fullAddress || booking.address || ""}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 12px 0;">
                            <span style="color: #64748b; font-size: 14px;">✨ Extras</span>
                          </td>
                          <td style="padding: 12px 0; text-align: right;">
                            <span style="color: #1a1a2e; font-weight: 600; font-size: 14px;">${extrasText}</span>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <!-- Total Price -->
                    <div style="background: linear-gradient(135deg, #1e5bb0 0%, #2d7dd2 100%); border-radius: 12px; padding: 20px; text-align: center;">
                      <span style="color: rgba(255, 255, 255, 0.8); font-size: 14px; display: block; margin-bottom: 5px;">Total Amount</span>
                      <span style="color: #ffffff; font-size: 32px; font-weight: bold;">$${booking.totalPrice ?? ""}</span>
                    </div>
                    
                    <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                      Questions? Reply to this email or call us anytime.<br>
                      We're here to help!
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
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TidyWise Cleaning <onboarding@resend.dev>",
        to: [customerEmail],
        subject: `Booking Confirmed - ${booking.confirmationNumber || ""}`,
        html: emailHtml,
      }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch (_e) {
      data = null;
    }

    if (!res.ok) {
      console.error("Resend API error:", { status: res.status, data });
      throw new Error(data?.message || `Failed to send email (status ${res.status})`);
    }

    console.log("Customer email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, emailId: data?.id }), {
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
