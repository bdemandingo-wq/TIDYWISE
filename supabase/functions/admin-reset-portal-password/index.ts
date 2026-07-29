import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { requireOrgAdmin, sharedCorsHeaders as corsHeaders } from "../_shared/requireOrgAdmin.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const portalUserId = typeof body?.portalUserId === "string" ? body.portalUserId.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    // 1. Validate inputs
    if (!portalUserId) {
      console.warn(`[admin-reset-portal-password] rejected: missing portalUserId`);
      return json(400, { success: false, error: "portalUserId is required", errorCode: "missing_portal_user_id" });
    }
    if (newPassword.length < 8) {
      console.warn(`[admin-reset-portal-password] rejected: short password | portal_user:${portalUserId}`);
      return json(400, {
        success: false,
        error: "Password must be at least 8 characters",
        errorCode: "invalid_password",
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 2. Resolve the owning organisation SERVER-SIDE
    const { data: portalUser, error: lookupError } = await supabase
      .from("client_portal_users")
      .select("id, organization_id, customer_id, is_active")
      .eq("id", portalUserId)
      .maybeSingle();

    if (lookupError) {
      console.error(
        `[admin-reset-portal-password] lookup failed | portal_user:${portalUserId} | ${lookupError.message}`
      );
      return json(500, { success: false, error: "Failed to look up portal user", errorCode: "lookup_failed" });
    }

    if (!portalUser) {
      console.warn(`[admin-reset-portal-password] rejected: not found | portal_user:${portalUserId}`);
      return json(404, { success: false, error: "Portal user not found", errorCode: "portal_user_not_found" });
    }

    const resolvedOrganizationId: string | null = portalUser.organization_id ?? null;
    if (!resolvedOrganizationId) {
      console.warn(
        `[admin-reset-portal-password] rejected: portal user has no organization_id | portal_user:${portalUserId}`
      );
      return json(409, {
        success: false,
        error: "This portal user is not linked to an organisation and cannot be reset",
        errorCode: "unresolvable_organization",
      });
    }

    // 3. ONLY NOW authorise, against the resolved organisation
    const auth = await requireOrgAdmin(req, resolvedOrganizationId);
    if (auth instanceof Response) {
      console.warn(
        `[admin-reset-portal-password] rejected: authorisation failed | portal_user:${portalUserId} | org:${resolvedOrganizationId} | status:${auth.status}`
      );
      return auth;
    }

    // 4. Perform the reset with the service-role client
    const { error: rpcError } = await supabase.rpc("reset_client_portal_password", {
      p_user_id: portalUserId,
      p_new_password: newPassword,
    });

    if (rpcError) {
      console.error(
        `[admin-reset-portal-password] reset failed | admin:${auth.user.id} | portal_user:${portalUserId} | org:${resolvedOrganizationId} | ${rpcError.message}`
      );
      return json(500, { success: false, error: "Failed to reset password", errorCode: "reset_failed" });
    }

    console.log(
      `[admin-reset-portal-password] reset succeeded | admin:${auth.user.id} | portal_user:${portalUserId} | org:${resolvedOrganizationId}`
    );

    return json(200, { success: true });
  } catch (err) {
    console.error(`[admin-reset-portal-password] unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return json(500, { success: false, error: "Unexpected server error", errorCode: "server_error" });
  }
});
