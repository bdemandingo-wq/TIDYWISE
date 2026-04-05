import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIDYWISE_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4";
const ADMIN_PHONES = ["+15615718725", "+18137356859"];

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current time in EST
    const now = new Date();
    const estOffset = -5; // EST (simplified, doesn't handle DST)
    const estNow = new Date(now.getTime() + (now.getTimezoneOffset() + estOffset * 60) * 60000);

    // Get confirmed demos
    const { data: demos, error } = await supabase
      .from("demo_bookings")
      .select("*")
      .in("status", ["confirmed", "rescheduled"]);

    if (error) {
      console.error("[demo-reminders] DB error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!demos || demos.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get SMS settings
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id")
      .eq("organization_id", TIDYWISE_ORG_ID)
      .maybeSingle();

    if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      console.log("[demo-reminders] No SMS settings configured");
      return new Response(JSON.stringify({ success: true, sent: 0, reason: "no_sms_settings" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check which reminders already sent
    const { data: sentReminders } = await supabase
      .from("demo_reminder_log")
      .select("demo_booking_id, reminder_type");

    const sentSet = new Set(
      (sentReminders || []).map((r: any) => `${r.demo_booking_id}:${r.reminder_type}`)
    );

    let sentCount = 0;

    for (const demo of demos) {
      // Parse demo datetime in EST
      const [year, month, day] = demo.booked_date.split("-").map(Number);
      const [hours, minutes] = demo.booked_time.split(":").map(Number);
      const demoTime = new Date(year, month - 1, day, hours, minutes);

      const hoursUntilDemo = (demoTime.getTime() - estNow.getTime()) / (1000 * 60 * 60);

      const firstName = demo.full_name.split(" ")[0];
      const dateDisplay = `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][demoTime.getDay()]}, ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][demoTime.getMonth()]} ${day}`;
      const timeDisplay = formatTime12h(demo.booked_time.substring(0, 5));

      // 24-hour reminder to client (send between 23-25 hours before)
      if (hoursUntilDemo >= 23 && hoursUntilDemo <= 25 && !sentSet.has(`${demo.id}:24h_client`)) {
        try {
          await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
              Authorization: smsSettings.openphone_api_key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `Hey ${firstName}! Just a reminder your TidyWise demo with Emmanuel is tomorrow at ${timeDisplay} EST. He'll call you at ${demo.phone}.\n\nNeed to reschedule?\n→ jointidywise.com/demo\nor reply to this message.\n\nSee you tomorrow! 🎉`,
              to: [demo.phone],
              from: smsSettings.openphone_phone_number_id,
            }),
          });

          await supabase.from("demo_reminder_log").insert({
            demo_booking_id: demo.id,
            reminder_type: "24h_client",
          });

          console.log(`[demo-reminders] 24h client reminder sent to ${demo.phone}`);
          sentCount++;
        } catch (err) {
          console.error(`[demo-reminders] 24h client reminder failed:`, err);
        }
      }

      // 1-hour reminder to Emmanuel (send between 55min-65min before)
      if (hoursUntilDemo >= 0.92 && hoursUntilDemo <= 1.08 && !sentSet.has(`${demo.id}:1h_admin`)) {
        const adminMsg = `⏰ DEMO REMINDER\n\n${demo.full_name} from ${demo.business_name}\nin 1 hour at ${timeDisplay} EST\n\n📞 ${demo.phone}\n📧 ${demo.email}\nChallenge: ${demo.biggest_challenge || "N/A"}`;

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

          await supabase.from("demo_reminder_log").insert({
            demo_booking_id: demo.id,
            reminder_type: "1h_admin",
          });

          console.log(`[demo-reminders] 1h admin reminder sent for ${demo.full_name}`);
          sentCount++;
        } catch (err) {
          console.error(`[demo-reminders] 1h admin reminder failed:`, err);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, checked: demos.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[demo-reminders] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
