import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgEmailSettings, formatEmailFrom } from "../_shared/get-org-email-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { campaignId, targetAudience } = await req.json();

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from("automated_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    // CRITICAL: Campaign must have organization_id for multi-tenant isolation
    if (!campaign.organization_id) {
      console.error("[send-followup-campaign] Campaign has no organization_id - cannot send emails without organization context");
      return new Response(JSON.stringify({ 
        error: "Campaign is not associated with an organization. Please update the campaign." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("[send-followup-campaign] Running campaign for organization:", campaign.organization_id);

    // Get email settings from organization_email_settings table
    const emailSettingsResult = await getOrgEmailSettings(campaign.organization_id);
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      console.error("[send-followup-campaign] Failed to get email settings:", emailSettingsResult.error);
      return new Response(
        JSON.stringify({ error: emailSettingsResult.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailSettings = emailSettingsResult.settings;
    const senderFrom = formatEmailFrom(emailSettings);

    // Get business settings for branding
    const { data: businessSettings } = await supabase
      .from("business_settings")
      .select("company_name")
      .eq("organization_id", campaign.organization_id)
      .maybeSingle();

    const companyName = businessSettings?.company_name || emailSettings.from_name;
    
    console.log("[send-followup-campaign] Using sender:", senderFrom, "company:", companyName);

    const audience: string = targetAudience || "inactive_clients";

    // Find recipients based on campaign type and audience
    let recipients: any[] = [];

    if (campaign.type === "inactive_customer" || campaign.type === "custom") {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (campaign.days_inactive || 30));

      // Get all customers for this org first
      const { data: allCustomers } = await supabase
        .from("customers")
        .select("id, email, first_name, last_name")
        .eq("organization_id", campaign.organization_id)
        .not("email", "is", null);

      if (allCustomers) {
        for (const customer of allCustomers) {
          if (!customer.email) continue;

          const { data: lastBooking } = await supabase
            .from("bookings")
            .select("scheduled_at")
            .eq("customer_id", customer.id)
            .eq("organization_id", campaign.organization_id)
            .eq("status", "completed")
            .order("scheduled_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const isInactive = lastBooking
            ? new Date(lastBooking.scheduled_at) < cutoffDate
            : true; // no completed booking → treat as inactive

          const isActive = lastBooking
            ? new Date(lastBooking.scheduled_at) >= cutoffDate
            : false;

          // Apply audience filter
          let include = false;
          if (audience === "all_customers") {
            include = true;
          } else if (audience === "inactive_clients" || audience === "inactive_customer") {
            include = isInactive;
          } else if (audience === "active_clients") {
            include = isActive;
          } else if (audience === "leads") {
            // Leads: customers with no completed bookings at all
            include = !lastBooking;
          } else {
            include = true;
          }

          if (!include) continue;

          // De-duplicate: skip if already emailed for this campaign in last 30 days
          const { data: recentEmail } = await supabase
            .from("campaign_emails")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("customer_id", customer.id)
            .gte("sent_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
            .maybeSingle();

          if (!recentEmail) {
            recipients.push(customer);
          }
        }
      }
    }

    console.log(`[send-followup-campaign] Found ${recipients.length} recipients for org ${campaign.organization_id} audience=${audience}`);

    const emailsSent: string[] = [];
    const emailsFailed: string[] = [];

    // Build the booking URL using APP_URL (same pattern as send-referral-invite)
    const appUrl = Deno.env.get("APP_URL") || "https://jointidywise.com";
    const { data: orgData } = await supabase
      .from("organizations")
      .select("slug")
      .eq("id", campaign.organization_id)
      .single();
    const orgSlug = orgData?.slug || "";
    const bookingUrl = orgSlug ? `${appUrl}/book/${orgSlug}` : `${appUrl}/book`;

    // Send emails to recipients
    for (const customer of recipients) {
      // Replace placeholders — support both {single} and {{double}} brace formats
      const substitutions = (text: string) =>
        text
          // Double-brace format (legacy)
          .replace(/\{\{customer_name\}\}/g, customer.first_name)
          .replace(/\{\{company_name\}\}/g, companyName)
          // Single-brace format (current UI)
          .replace(/\{first_name\}/g, customer.first_name)
          .replace(/\{last_name\}/g, customer.last_name || "")
          .replace(/\{company_name\}/g, companyName)
          .replace(/\{booking_link\}/g, bookingUrl);

      const subject = substitutions(campaign.subject);
      const body = substitutions(campaign.body);

      // Convert markdown-style bold to HTML
      const htmlBody = body
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${emailSettings.resend_api_key || RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: senderFrom,
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
                    <a href="${bookingUrl}"
                       style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                      Book Now
                    </a>
                  </div>
                  ${emailSettings.email_footer ? `<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;"><p style="font-size: 12px; color: #9ca3af;">${emailSettings.email_footer}</p>` : ''}
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
        console.error(`[send-followup-campaign] Failed to send email to ${customer.email}:`, error);
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
        sentCount: emailsSent.length,
        emailsSent: emailsSent.length,
        emailsFailed: emailsFailed.length,
        details: { sent: emailsSent, failed: emailsFailed },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[send-followup-campaign] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
