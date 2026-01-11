import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit } from "../_shared/audit-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendLinkRequest {
  staffId: string;
  redirectUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify the caller is an authenticated admin
    const authResult = await verifyAdminAuth(req.headers.get("Authorization"), { requireAdmin: true });
    if (!authResult.success) {
      console.error("[RESEND-STAFF-PASSWORD-LINK] Authorization failed:", authResult.error);
      return createUnauthorizedResponse(authResult.error || "Unauthorized", corsHeaders);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { staffId, redirectUrl }: ResendLinkRequest = await req.json();

    if (!staffId) {
      return new Response(JSON.stringify({ error: "Staff ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get staff member details
    const { data: staffMember, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("*")
      .eq("id", staffId)
      .single();

    if (staffError || !staffMember) {
      console.error("[RESEND-STAFF-PASSWORD-LINK] Error finding staff:", staffError);
      return new Response(JSON.stringify({ error: "Staff member not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Verify staff belongs to the caller's organization
    if (staffMember.organization_id !== authResult.organizationId) {
      console.error("[RESEND-STAFF-PASSWORD-LINK] Organization mismatch:", {
        staffOrg: staffMember.organization_id,
        adminOrg: authResult.organizationId
      });
      
      logAudit({
        action: "STAFF_PASSWORD_LINK_BLOCKED",
        organizationId: authResult.organizationId || "unknown",
        userId: authResult.userId || "unknown",
        resourceType: "staff",
        resourceId: staffId,
        success: false,
        error: "Attempted to generate password link for staff in different organization"
      });

      return createForbiddenResponse("Cannot generate password link for staff outside your organization", corsHeaders);
    }

    if (!staffMember.user_id) {
      return new Response(JSON.stringify({ error: "Staff member has no associated user account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") ?? "";
    const safeRedirectUrl =
      redirectUrl && origin && redirectUrl.startsWith(origin)
        ? redirectUrl
        : origin
          ? `${origin}/staff/reset-password`
          : redirectUrl;

    // Generate password reset link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: staffMember.email,
      options: {
        redirectTo: safeRedirectUrl,
      },
    });

    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      return new Response(JSON.stringify({ error: "Failed to generate password reset link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resetLink = linkData.properties?.action_link;
    console.log("Generated reset link for staff:", staffMember.email);

    return new Response(
      JSON.stringify({
        success: true,
        resetLink,
        staffName: staffMember.name,
        staffEmail: staffMember.email,
        message: "Password reset link generated successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in resend-staff-password-link:", error);
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
