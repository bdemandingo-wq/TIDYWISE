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

  try {
    const booking: BookingEmailRequest = await req.json();
    
    console.log("Sending booking confirmation email to:", booking.customerEmail);

    const fullAddress = [
      booking.address,
      booking.city,
      booking.state,
      booking.zipCode
    ].filter(Boolean).join(", ");

    const extrasText = booking.extras && booking.extras.length > 0 
      ? booking.extras.join(", ") 
      : "None";

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          .success-badge { display: inline-block; background-color: #d1fae5; color: #059669; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin-bottom: 20px; }
          .details { background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #6b7280; }
          .detail-value { font-weight: 600; color: #111827; }
          .total-row { background-color: #10b981; color: white; padding: 15px 20px; border-radius: 8px; display: flex; justify-content: space-between; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✨ Booking Confirmed!</h1>
          </div>
          <div class="content">
            <p>Hi ${booking.customerName},</p>
            <p>Thank you for booking with Footprint Cleaning! Your appointment has been confirmed.</p>
            
            <span class="success-badge">Confirmation: ${booking.confirmationNumber}</span>
            
            <div class="details">
              <div class="detail-row">
                <span class="detail-label">Service</span>
                <span class="detail-value">${booking.serviceName}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Home Size</span>
                <span class="detail-value">${booking.homeSize}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Date</span>
                <span class="detail-value">${booking.appointmentDate}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Time</span>
                <span class="detail-value">${booking.appointmentTime}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Address</span>
                <span class="detail-value">${fullAddress}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Extras</span>
                <span class="detail-value">${extrasText}</span>
              </div>
            </div>
            
            <div class="total-row">
              <span>Total Price</span>
              <span style="font-size: 20px; font-weight: bold;">$${booking.totalPrice}</span>
            </div>
            
            <p style="margin-top: 20px;">If you have any questions, please don't hesitate to contact us.</p>
          </div>
          <div class="footer">
            <p>Footprint Cleaning</p>
            <p>Thank you for choosing us!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email using Resend API directly
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Footprint Cleaning <onboarding@resend.dev>",
        to: [booking.customerEmail],
        subject: `Booking Confirmed - ${booking.confirmationNumber}`,
        html: emailHtml,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      throw new Error(data.message || "Failed to send email");
    }

    console.log("Customer email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, emailId: data.id }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-booking-email function:", error);
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
