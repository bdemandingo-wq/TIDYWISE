import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      fullName,
      email,
      phone,
      businessName,
      teamSize,
      biggestChallenge,
      preferredDays,
      preferredTime,
    } = await req.json();

    if (!fullName || !email || !phone || !businessName) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // TidyWise org ID
    const TIDYWISE_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4";
    // Emmanuel's phone
    const ADMIN_PHONES = ["+15615718725", "+18137356859"];

    // 1. Send SMS to Emmanuel via OpenPhone
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
      .eq("organization_id", TIDYWISE_ORG_ID)
      .maybeSingle();

    if (smsSettings?.openphone_api_key && smsSettings?.openphone_phone_number_id) {
      const smsMessage = `📅 NEW DEMO REQUEST!\n\nName: ${fullName}\nBusiness: ${businessName}\nPhone: ${phone}\nEmail: ${email}\nTeam: ${teamSize || "N/A"}\nChallenge: ${biggestChallenge || "N/A"}\nPrefers: ${preferredDays?.join(", ") || "Any"} ${preferredTime || ""}\n\nReply to confirm their demo!`;

      try {
        await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: {
            Authorization: smsSettings.openphone_api_key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: smsMessage,
            to: ADMIN_PHONES,
            from: smsSettings.openphone_phone_number_id,
          }),
        });
        console.log("[notify-demo-request] SMS sent to Emmanuel");
      } catch (smsErr) {
        console.error("[notify-demo-request] SMS error:", smsErr);
      }
    }

    // 2. Send confirmation email to prospect via Resend
    const { data: emailSettings } = await supabase
      .from("organization_email_settings")
      .select("resend_api_key, from_email, from_name")
      .eq("organization_id", TIDYWISE_ORG_ID)
      .maybeSingle();

    if (emailSettings?.resend_api_key) {
      const firstName = fullName.split(" ")[0];
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Your TidyWise Demo Request is Confirmed! 🎉</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Hi ${firstName}!
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Thanks for your interest in TidyWise! We received your demo request and Emmanuel will reach out to you at <strong>${phone}</strong> or <strong>${email}</strong> within 2 hours to confirm your demo time.
          </p>
          <h3 style="color: #1a1a1a; font-size: 18px;">Here's what to expect:</h3>
          <ul style="color: #555; font-size: 16px; line-height: 2;">
            <li>20-minute live walkthrough</li>
            <li>See your exact workflow automated</li>
            <li>Q&A — ask anything you want</li>
            <li>Get set up same day if you're ready</li>
          </ul>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Talk soon,<br/>
            <strong>Emmanuel Forkuoh</strong><br/>
            Founder, TidyWise<br/>
            📞 (561) 571-8725<br/>
            🌐 jointidywise.com
          </p>
        </div>
      `;

      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${emailSettings.resend_api_key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${emailSettings.from_name || "TidyWise"} <${emailSettings.from_email || "noreply@tidywisecleaning.com"}>`,
            to: [email],
            subject: "Your TidyWise Demo Request is Confirmed! 🎉",
            html: emailHtml,
          }),
        });
        console.log("[notify-demo-request] Confirmation email sent to", email);
      } catch (emailErr) {
        console.error("[notify-demo-request] Email error:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[notify-demo-request] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
