import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
  phone?: string;
  redirectUrl: string;
  organizationId?: string;
}

// Format phone to E.164
function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.startsWith('+') ? phone : `+${digits}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, phone, redirectUrl, organizationId: providedOrgId }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[send-staff-password-reset] Processing password reset for:", email);

    // Look up the staff member
    const { data: staffMember, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("name, user_id, organization_id, phone")
      .eq("email", email)
      .maybeSingle();

    if (staffError) {
      console.error("[send-staff-password-reset] Error looking up staff:", staffError);
    }

    const organizationId = providedOrgId || staffMember?.organization_id;
    const staffPhone = phone || staffMember?.phone;

    if (!organizationId) {
      console.log("[send-staff-password-reset] No organization found for email:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get SMS settings for the organization
    const { data: smsSettings } = await supabaseAdmin
      .from('organization_sms_settings')
      .select('sms_enabled, openphone_api_key, openphone_phone_number_id')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!smsSettings?.sms_enabled || !smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      console.log("[send-staff-password-reset] SMS not configured for org:", organizationId);
      return new Response(
        JSON.stringify({ error: "SMS is not configured for this organization. Please contact your administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!staffPhone) {
      console.log("[send-staff-password-reset] No phone number for staff:", email);
      return new Response(
        JSON.stringify({ error: "No phone number on file. Please contact your administrator." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get business name
    const { data: businessSettings } = await supabaseAdmin
      .from('business_settings')
      .select('company_name')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const companyName = businessSettings?.company_name || "Your Company";

    const origin = req.headers.get("origin") ?? "";
    const safeRedirectUrl =
      redirectUrl && origin && redirectUrl.startsWith(origin)
        ? redirectUrl
        : origin
          ? `${origin}/staff/reset-password`
          : redirectUrl;

    let staffName = staffMember?.name || "Team Member";
    let targetUserId: string | null = staffMember?.user_id || null;

    if (!targetUserId) {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      const match = usersData?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
      );
      if (match) {
        targetUserId = match.id;
        const metaName = (match.user_metadata as Record<string, unknown> | null)?.full_name;
        if (typeof metaName === "string" && metaName.trim()) staffName = metaName;
      }
    }

    if (!targetUserId) {
      console.log("[send-staff-password-reset] No account found for email:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify staff/admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .in("role", ["staff", "admin"]);

    if (!roleData || roleData.length === 0) {
      console.log("[send-staff-password-reset] User has no staff/admin role:", email);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate recovery link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: safeRedirectUrl },
    });

    if (linkError) {
      console.error("[send-staff-password-reset] Error generating recovery link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate reset link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetLink = linkData.properties?.action_link;
    console.log("[send-staff-password-reset] Generated reset link, sending via SMS");

    // Send SMS via OpenPhone
    const formattedPhone = formatPhoneE164(staffPhone);
    const message = `Hi ${staffName}! Reset your ${companyName} staff portal password here: ${resetLink}`;

    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');

    const response = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: smsSettings.openphone_phone_number_id,
        to: [formattedPhone],
        content: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[send-staff-password-reset] SMS failed: ${response.status} - ${errorText}`);
      return new Response(
        JSON.stringify({ error: "Failed to send SMS. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-staff-password-reset] SMS sent successfully to:", formattedPhone);

    return new Response(JSON.stringify({ success: true, message: "Password reset link sent via SMS" }), {
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