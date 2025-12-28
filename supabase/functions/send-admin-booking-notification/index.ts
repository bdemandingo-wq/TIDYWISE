import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BookingNotificationRequest {
  customerName: string;
  customerEmail: string;
  serviceName: string;
  scheduledAt: string;
  totalAmount: number;
  address?: string;
  organizationId: string; // REQUIRED - no fallback allowed
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      customerName, 
      customerEmail, 
      serviceName, 
      scheduledAt, 
      totalAmount,
      address,
      organizationId
    }: BookingNotificationRequest = await req.json();

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!organizationId) {
      console.error("Missing organizationId - cannot send notification without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Sending admin notification for new booking:", { customerName, serviceName, scheduledAt, organizationId });

    // Fetch business settings for the SPECIFIC organization only
    let senderEmail = "";
    let adminEmail = "";
    let companyName = "";
    
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
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
      adminEmail = settings.company_email;
      companyName = settings.company_name;
      
      console.log("Using organization settings - sender:", senderEmail, "company:", companyName);
    } else {
      return new Response(JSON.stringify({ error: "Database connection not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const bookingDate = new Date(scheduledAt);
    const formattedDate = bookingDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = bookingDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });

    const emailResponse = await resend.emails.send({
      from: `${companyName} <${senderEmail}>`,
      to: [adminEmail],
      subject: `🆕 New Booking: ${customerName} - ${serviceName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f5; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 25px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 22px; }
            .content { background: white; padding: 25px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .badge { display: inline-block; background: #22c55e; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-bottom: 15px; }
            .details-grid { display: grid; gap: 15px; }
            .detail-row { display: flex; border-bottom: 1px solid #e5e7eb; padding: 12px 0; }
            .detail-row:last-child { border-bottom: none; }
            .detail-label { color: #6b7280; width: 120px; font-size: 14px; }
            .detail-value { font-weight: 600; color: #111827; flex: 1; }
            .amount-box { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-top: 20px; }
            .amount-label { font-size: 14px; opacity: 0.9; }
            .amount-value { font-size: 32px; font-weight: bold; margin-top: 5px; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; padding: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📋 New Booking Created</h1>
            </div>
            <div class="content">
              <span class="badge">NEW BOOKING</span>
              
              <div class="details-grid">
                <div class="detail-row">
                  <span class="detail-label">Customer</span>
                  <span class="detail-value">${customerName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email</span>
                  <span class="detail-value">${customerEmail}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Service</span>
                  <span class="detail-value">${serviceName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date</span>
                  <span class="detail-value">${formattedDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time</span>
                  <span class="detail-value">${formattedTime}</span>
                </div>
                ${address ? `
                <div class="detail-row">
                  <span class="detail-label">Address</span>
                  <span class="detail-value">${address}</span>
                </div>
                ` : ''}
              </div>
              
              <div class="amount-box">
                <div class="amount-label">Total Amount</div>
                <div class="amount-value">$${totalAmount.toFixed(2)}</div>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated notification from your booking system.</p>
              <p>Log in to your admin dashboard to view full details.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Admin notification email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      emailId: emailResponse.data?.id 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-admin-booking-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
