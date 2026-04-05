import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_PHONES = ["+15615718725", "+18137356859"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { org_id, org_name, created_at } = await req.json();

    if (!org_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing org_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[notify-new-org] New org: ${org_name} (${org_id})`);

    // Fetch owner details from org_memberships
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("user_id, role")
      .eq("organization_id", org_id)
      .eq("role", "owner")
      .maybeSingle();

    let ownerName = "Unknown";
    let ownerEmail = "N/A";
    let ownerPhone = "N/A";

    if (membership?.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", membership.user_id)
        .maybeSingle();

      if (profile) {
        ownerName = profile.full_name || profile.email || "Unknown";
        ownerEmail = profile.email || "N/A";
        ownerPhone = profile.phone || "N/A";
      }
    }

    // Get subscription plan
    const { data: orgData } = await supabase
      .from("organizations")
      .select("subscription_tier, subscription_status")
      .eq("id", org_id)
      .maybeSingle();

    const plan = orgData?.subscription_tier || "trial";
    const status = orgData?.subscription_status || "trial";

    // Get total org count
    const { count: totalOrgs } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true });

    // Get this month's org count
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: monthOrgs } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString());

    // Format time in EST
    const timestamp = new Date(created_at || Date.now()).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const message =
      `🎉 NEW ORG SIGNED UP!\n\n` +
      `Business: ${org_name || "Unnamed"}\n` +
      `Owner: ${ownerName}\n` +
      `Email: ${ownerEmail}\n` +
      `Phone: ${ownerPhone}\n` +
      `Plan: ${plan} (${status})\n` +
      `Time: ${timestamp} EST\n` +
      `Total Orgs: ${totalOrgs || 0}\n` +
      `This Month: ${monthOrgs || 0}\n\n` +
      `→ jointidywise.com/platform-analytics`;

    // Send SMS via OpenPhone
    const openphoneApiKey = Deno.env.get("OPENPHONE_API_KEY");
    const openphonePhoneNumberId = Deno.env.get("OPENPHONE_PHONE_NUMBER_ID");

    let smsSent = false;

    if (openphoneApiKey && openphonePhoneNumberId) {
      try {
        const smsRes = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: {
            Authorization: openphoneApiKey.startsWith("Bearer ") ? openphoneApiKey : `Bearer ${openphoneApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: openphonePhoneNumberId,
            to: [EMMANUEL_PHONE],
            content: message,
          }),
        });

        if (smsRes.ok) {
          smsSent = true;
          const smsResult = await smsRes.json();
          console.log("[notify-new-org] SMS sent:", smsResult?.data?.id);
        } else {
          const errText = await smsRes.text();
          console.error("[notify-new-org] SMS failed:", smsRes.status, errText);
        }
      } catch (smsErr) {
        console.error("[notify-new-org] SMS error:", smsErr);
      }
    } else {
      console.log("[notify-new-org] OpenPhone not configured");
    }

    // Log to platform_notifications
    await supabase.from("platform_notifications").insert({
      org_id,
      notification_type: "new_org",
      sent_to: EMMANUEL_PHONE,
      message_preview: `${org_name || "Unnamed"} signed up`,
      metadata: {
        org_name: org_name || "Unnamed",
        owner_name: ownerName,
        owner_email: ownerEmail,
        owner_phone: ownerPhone,
        plan,
        status,
        sms_sent: smsSent,
        total_orgs: totalOrgs,
        month_orgs: monthOrgs,
      },
    });

    return new Response(
      JSON.stringify({ success: true, sms_sent: smsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[notify-new-org] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
