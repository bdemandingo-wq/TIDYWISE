import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgEmailSettings, formatEmailFrom } from "../_shared/get-org-email-settings.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
  redirectUrl: string;
  organizationId?: string; // Optional - will be looked up from staff email if not provided
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("[send-staff-password-reset] Missing RESEND_API_KEY secret");
    return new Response(JSON.stringify({ error: "Email service is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseAdmin = createClient(
      SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, redirectUrl, organizationId: providedOrgId }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-staff-password-reset] Processing password reset for:", email);

    // Look up the staff member to find their organization
    const { data: staffMember, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("name, user_id, organization_id")
      .eq("email", email)
      .maybeSingle();

    if (staffError) {
      console.error("[send-staff-password-reset] Error looking up staff:", staffError);
    }

    // Use provided org ID or fall back to staff member's org
    const organizationId = providedOrgId || staffMember?.organization_id;

    if (!organizationId) {
      // Return success silently - don't reveal if email exists
      console.log("[send-staff-password-reset] No organization found for email:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-staff-password-reset] Processing password reset for:", email, "org:", organizationId);

    // Get email settings from organization_email_settings table
    const emailSettingsResult = await getOrgEmailSettings(organizationId);
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      console.error("[send-staff-password-reset] Failed to get email settings:", emailSettingsResult.error);
      return new Response(
        JSON.stringify({ error: emailSettingsResult.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailSettings = emailSettingsResult.settings;
    const senderFrom = formatEmailFrom(emailSettings);

    // Get business settings for branding
    const { data: businessSettings } = await supabaseAdmin
      .from('business_settings')
      .select('company_name, primary_color')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const companyName = businessSettings?.company_name || emailSettings.from_name;
    const primaryColor = businessSettings?.primary_color || "#1e5bb0";

    const origin = req.headers.get("origin") ?? "";
    const safeRedirectUrl =
      redirectUrl && origin && redirectUrl.startsWith(origin)
        ? redirectUrl
        : origin
          ? `${origin}/staff/reset-password`
          : redirectUrl;

    // Use the staff member data we already retrieved, or look up again if needed
    let staffName = staffMember?.name || "Team Member";
    let targetUserId: string | null = staffMember?.user_id || null;

    if (targetUserId) {
      // Already have the info from initial lookup
    } else {
      const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (usersError) {
        console.error("[send-staff-password-reset] Error listing users:", usersError);
      } else {
        const match = usersData?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
        );
        if (match) {
          targetUserId = match.id;
          const metaName = (match.user_metadata as Record<string, unknown> | null)?.full_name;
          if (typeof metaName === "string" && metaName.trim()) staffName = metaName;
        }
      }
    }

    if (!targetUserId) {
      console.log("[send-staff-password-reset] No account found for email:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .in("role", ["staff", "admin"]);

    if (!roleData || roleData.length === 0) {
      console.log("[send-staff-password-reset] User has no staff/admin role:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: safeRedirectUrl,
      },
    });

    if (linkError) {
      console.error("[send-staff-password-reset] Error generating recovery link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate reset link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetLink = linkData.properties?.action_link;
    console.log("[send-staff-password-reset] Generated reset link, sending via Resend");

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
    <div style="background-color:${primaryColor}; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Password Reset</h1>
    </div>
    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${staffName},</p>
      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">Click the button below to set a new password for your staff portal.</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetLink}" style="display: inline-block; background-color:${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">If you didn't request this, you can ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color: ${primaryColor}; word-break: break-all;">${resetLink}</a>
      </p>
      ${emailSettings.email_footer ? `<p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">${emailSettings.email_footer}</p>` : ''}
    </div>
  </div>
</body>
</html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: senderFrom,
        to: [email],
        subject: "Reset Your Staff Portal Password",
        html: emailHtml,
      }),
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch (_e) {
      data = null;
    }

    if (!res.ok) {
      console.error("[send-staff-password-reset] Resend API error:", data);
      throw new Error(data?.message || `Failed to send email (status ${res.status})`);
    }

    console.log("[send-staff-password-reset] Email sent successfully to:", email);

    return new Response(JSON.stringify({ success: true, message: "Password reset email sent" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[send-staff-password-reset] Error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
