import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { referralId } = await req.json();

    // Get referral details with referrer info
    const { data: referral, error: referralError } = await supabase
      .from("referrals")
      .select(`
        *,
        referrer:referrer_customer_id (
          first_name,
          last_name,
          email
        )
      `)
      .eq("id", referralId)
      .single();

    if (referralError || !referral) {
      throw new Error("Referral not found");
    }

    // Get business settings
    const { data: settings } = await supabase
      .from("business_settings")
      .select("company_name")
      .limit(1)
      .maybeSingle();

    const companyName = settings?.company_name || "TidyWise";
    const referrerName = `${referral.referrer.first_name} ${referral.referrer.last_name}`;
    const creditAmount = referral.credit_amount || 25;

    // Create booking URL with referral code
    const bookingUrl = `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/book?ref=${referral.referral_code}`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName} <noreply@jointidywise.com>`,
        to: [referral.referred_email],
        subject: `${referrerName} thinks you'd love ${companyName}! Get $${creditAmount} off`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">You've Been Referred! 🎉</h1>
            </div>
            <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px;">Hi${referral.referred_name ? ` ${referral.referred_name}` : ''}!</p>
              
              <p style="font-size: 16px;">
                Your friend <strong>${referrerName}</strong> thinks you'd love our cleaning services, 
                and we're thrilled to offer you a special welcome gift:
              </p>
              
              <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">Your Welcome Credit</p>
                <p style="margin: 10px 0 0 0; font-size: 32px; font-weight: bold;">$${creditAmount} OFF</p>
              </div>
              
              <p style="font-size: 16px;">
                This credit will be automatically applied to your first booking. 
                Plus, ${referrerName} will also receive a $${creditAmount} credit as a thank you!
              </p>
              
              <div style="text-align: center; margin-top: 30px;">
                <a href="${bookingUrl}" 
                   style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Book Your First Clean
                </a>
              </div>
              
              <p style="font-size: 12px; color: #666; margin-top: 30px; text-align: center;">
                Your referral code: <strong>${referral.referral_code}</strong>
              </p>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-referral-invite:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
