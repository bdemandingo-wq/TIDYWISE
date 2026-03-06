import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { logToSystem } from "../_shared/system-logger.ts";
import { getOrgEmailSettings, formatEmailFrom, getReplyTo } from "../_shared/get-org-email-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, organizationName, reason, organizationId } = await req.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: "Name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Organization context is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get org-scoped email settings (single source of truth)
    const emailSettingsResult = await getOrgEmailSettings(organizationId);
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      console.error("[DELETION-EMAIL] Failed to get email settings:", emailSettingsResult.error);
      return new Response(JSON.stringify({ error: emailSettingsResult.error || "Email settings not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = emailSettingsResult.settings;
    const resendApiKey = settings.resend_api_key || Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("[DELETION-EMAIL] No Resend API key configured");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderFrom = formatEmailFrom(settings);
    const companyName = settings.from_name;

    const emailBody = `
Account Deletion Request

Name: ${name}
Email: ${email}
Organization: ${organizationName || companyName}
Reason: ${reason || "Not provided"}
Submitted: ${new Date().toISOString()}

Please verify the user's identity and process this deletion request within 7 business days.
    `.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: senderFrom,
        to: [settings.from_email],
        reply_to: getReplyTo(settings),
        subject: `Account Deletion Request - ${email}`,
        text: emailBody,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[DELETION-EMAIL] Resend error:", errText);
    }

    await logToSystem({
      level: "info",
      source: "send-deletion-request-email",
      message: `Account deletion request submitted by ${email} for org ${organizationId}`,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[DELETION-EMAIL] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
