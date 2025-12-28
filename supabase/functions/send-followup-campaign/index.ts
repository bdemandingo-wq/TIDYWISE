import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Campaign {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  days_inactive: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { campaignId } = await req.json();

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from("automated_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    // Get business settings for company name
    const { data: settings } = await supabase
      .from("business_settings")
      .select("company_name")
      .limit(1)
      .maybeSingle();

    const companyName = settings?.company_name || "Our Company";

    // Find inactive customers based on campaign type
    let inactiveCustomers: any[] = [];

    if (campaign.type === "inactive_customer") {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - campaign.days_inactive);

      // Get customers with their last booking date
      const { data: customers } = await supabase
        .from("customers")
        .select(`
          id,
          email,
          first_name,
          last_name
        `);

      if (customers) {
        for (const customer of customers) {
          // Get the customer's last completed booking
          const { data: lastBooking } = await supabase
            .from("bookings")
            .select("scheduled_at")
            .eq("customer_id", customer.id)
            .eq("status", "completed")
            .order("scheduled_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          // Check if they haven't booked recently
          if (lastBooking) {
            const lastBookingDate = new Date(lastBooking.scheduled_at);
            if (lastBookingDate < cutoffDate) {
              // Check if we've already emailed them for this campaign recently (within 30 days)
              const { data: recentEmail } = await supabase
                .from("campaign_emails")
                .select("id")
                .eq("campaign_id", campaignId)
                .eq("customer_id", customer.id)
                .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
                .maybeSingle();

              if (!recentEmail) {
                inactiveCustomers.push(customer);
              }
            }
          }
        }
      }
    }

    console.log(`Found ${inactiveCustomers.length} inactive customers to email`);

    const emailsSent: string[] = [];
    const emailsFailed: string[] = [];

    // Send emails to inactive customers
    for (const customer of inactiveCustomers) {
      const customerName = `${customer.first_name} ${customer.last_name}`;
      
      // Replace placeholders in subject and body
      const subject = campaign.subject
        .replace(/\{\{customer_name\}\}/g, customer.first_name)
        .replace(/\{\{company_name\}\}/g, companyName);
      
      const body = campaign.body
        .replace(/\{\{customer_name\}\}/g, customer.first_name)
        .replace(/\{\{company_name\}\}/g, companyName);

      // Convert markdown-style bold to HTML
      const htmlBody = body
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "TidyWise <support@tidywisecleaning.com>",
            to: [customer.email],
            subject: subject,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">We Miss You! 💙</h1>
                </div>
                <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px;">
                  <p style="font-size: 16px;">${htmlBody}</p>
                  <div style="text-align: center; margin-top: 30px;">
                    <a href="${supabaseUrl.replace('.supabase.co', '.lovable.app')}/book" 
                       style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                      Book Now
                    </a>
                  </div>
                </div>
              </body>
              </html>
            `,
          }),
        });

        if (emailResponse.ok) {
          // Record the sent email
          await supabase.from("campaign_emails").insert({
            campaign_id: campaignId,
            customer_id: customer.id,
            email: customer.email,
            status: "sent",
          });
          emailsSent.push(customer.email);
        } else {
          emailsFailed.push(customer.email);
        }
      } catch (error) {
        console.error(`Failed to send email to ${customer.email}:`, error);
        emailsFailed.push(customer.email);
      }
    }

    // Update campaign last_run_at
    await supabase
      .from("automated_campaigns")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", campaignId);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent: emailsSent.length,
        emailsFailed: emailsFailed.length,
        details: { sent: emailsSent, failed: emailsFailed },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-followup-campaign:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
