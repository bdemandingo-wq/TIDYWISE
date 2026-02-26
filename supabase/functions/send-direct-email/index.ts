import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgEmailSettings, formatEmailFrom, getReplyTo } from "../_shared/get-org-email-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const globalResendApiKey = Deno.env.get("RESEND_API_KEY");

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { organizationId, to, subject, body } = await req.json();

    if (!organizationId || !to || !subject || !body) {
      throw new Error("Missing required fields: organizationId, to, subject, body");
    }

    // Verify user belongs to organization
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!membership) throw new Error("Unauthorized: not a member of this organization");

    // Get org email settings (single source of truth)
    const emailResult = await getOrgEmailSettings(organizationId);
    if (!emailResult.success || !emailResult.settings) {
      throw new Error(emailResult.error || "Email settings not configured");
    }

    const settings = emailResult.settings;
    const from = formatEmailFrom(settings);
    const replyTo = getReplyTo(settings);

    // Use org-specific Resend API key if available, otherwise fall back to global
    const resendApiKey = settings.resend_api_key || globalResendApiKey;
    if (!resendApiKey) {
      throw new Error("No Resend API key configured. Please add one in Email Settings or contact support.");
    }

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: replyTo,
        subject,
        html: body + (settings.email_footer ? `<br/><br/><p style="color:#666;font-size:12px;">${settings.email_footer}</p>` : ""),
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("[send-direct-email] Resend error:", resendData);
      throw new Error(resendData?.message || "Failed to send email");
    }

    console.log("[send-direct-email] Email sent:", { to, subject, resendId: resendData.id });

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[send-direct-email] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
