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
      bookedDate,
      bookedTime,
      timezone,
      // Legacy fields (kept for backward compatibility)
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

    const TIDYWISE_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4";
    const ADMIN_PHONES = ["+15615718725", "+18137356859"];

    // Format date/time for display
    let dateDisplay = "";
    let timeDisplay = "";
    if (bookedDate && bookedTime) {
      const [year, month, day] = bookedDate.split("-");
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      dateDisplay = `${days[dateObj.getDay()]}, ${months[dateObj.getMonth()]} ${parseInt(day)}, ${year}`;
      
      const [h, m] = bookedTime.split(":").map(Number);
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      timeDisplay = `${h12}:${m.toString().padStart(2, "0")} ${period}`;
    }

    // Get total demo count
    const { count: totalDemos } = await supabase
      .from("demo_bookings")
      .select("*", { count: "exact", head: true })
      .eq("status", "confirmed");

    // 1. Send SMS to admins via OpenPhone
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
      .eq("organization_id", TIDYWISE_ORG_ID)
      .maybeSingle();

    if (smsSettings?.openphone_api_key && smsSettings?.openphone_phone_number_id) {
      // Admin notification
      const adminMsg = bookedDate && bookedTime
        ? `📅 NEW DEMO BOOKED!\n\n${fullName}\nBusiness: ${businessName}\nPhone: ${phone}\nEmail: ${email}\nTeam: ${teamSize || "N/A"}\nChallenge: ${biggestChallenge || "N/A"}\n\n📆 ${dateDisplay}\n⏰ ${timeDisplay} EST\n\nTotal demos booked: ${totalDemos || 1}\n→ jointidywise.com/admin/platform-analytics`
        : `📅 NEW DEMO REQUEST!\n\nName: ${fullName}\nBusiness: ${businessName}\nPhone: ${phone}\nEmail: ${email}\nTeam: ${teamSize || "N/A"}\nChallenge: ${biggestChallenge || "N/A"}\nPrefers: ${preferredDays?.join(", ") || "Any"} ${preferredTime || ""}\n\nReply to confirm their demo!`;

      try {
        for (const adminPhone of ADMIN_PHONES) {
          await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
              Authorization: smsSettings.openphone_api_key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: adminMsg,
              to: [adminPhone],
              from: smsSettings.openphone_phone_number_id,
            }),
          });
        }
        console.log("[notify-demo-request] Admin SMS sent");
      } catch (smsErr) {
        console.error("[notify-demo-request] Admin SMS error:", smsErr);
      }

      // Prospect confirmation SMS (only for calendar bookings)
      if (bookedDate && bookedTime && phone) {
        const firstName = fullName.split(" ")[0];
        const prospectMsg = `Hey ${firstName}! 🎉\n\nYour TidyWise demo is confirmed!\n\n📆 ${dateDisplay}\n⏰ ${timeDisplay} EST\n\nEmmanuel will call you at ${phone} at that time.\n\nQuestions before then? Text or call: (561) 571-8725\n\nSee you soon!\n— Emmanuel, TidyWise`;

        try {
          await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
              Authorization: smsSettings.openphone_api_key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: prospectMsg,
              to: [phone],
              from: smsSettings.openphone_phone_number_id,
            }),
          });
          console.log("[notify-demo-request] Prospect SMS sent to", phone);
        } catch (smsErr) {
          console.error("[notify-demo-request] Prospect SMS error:", smsErr);
        }
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
      
      const emailSubject = bookedDate && bookedTime
        ? `Your TidyWise Demo is Confirmed for ${dateDisplay} at ${timeDisplay} ✅`
        : "Your TidyWise Demo Request is Confirmed! 🎉";

      const emailHtml = bookedDate && bookedTime
        ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Your Demo is Locked In! ✅</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi ${firstName}!</p>
          <div style="background: #f5f5f5; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="margin: 5px 0; font-size: 16px;"><strong>📆 Date:</strong> ${dateDisplay}</p>
            <p style="margin: 5px 0; font-size: 16px;"><strong>⏰ Time:</strong> ${timeDisplay} EST</p>
            <p style="margin: 5px 0; font-size: 16px;"><strong>📞 How:</strong> Emmanuel will call you at ${phone}</p>
          </div>
          <h3 style="color: #1a1a1a; font-size: 18px;">What we'll cover:</h3>
          <ul style="color: #555; font-size: 16px; line-height: 2;">
            <li>Your specific business workflow</li>
            <li>Bookings and scheduling automation</li>
            <li>Client communication and payments</li>
            <li>Staff management and payroll</li>
            <li>Live Q&A — ask anything</li>
          </ul>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">While you wait, explore TidyWise:</p>
          <p style="font-size: 16px;">
            → <a href="https://jointidywise.com/pricing" style="color: #2563eb;">Pricing</a><br/>
            → <a href="https://jointidywise.com/#features" style="color: #2563eb;">Features</a>
          </p>
          <p style="color: #555; font-size: 16px; line-height: 1.6; margin-top: 20px;">
            Talk soon!<br/>
            <strong>Emmanuel Forkuoh</strong><br/>
            Founder, TidyWise<br/>
            📞 (561) 571-8725<br/>
            🌐 jointidywise.com
          </p>
        </div>`
        : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
          <h1 style="color: #1a1a1a; font-size: 24px;">Your TidyWise Demo Request is Confirmed! 🎉</h1>
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi ${firstName}!</p>
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
        </div>`;

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
            subject: emailSubject,
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
