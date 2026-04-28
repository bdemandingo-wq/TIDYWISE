// Shared auth helper: validates the caller is authenticated AND is an
// owner/admin of the supplied organization. Throws Response on failure.
//
// Usage:
//   const { user, supabaseAdmin } = await requireOrgAdmin(req, organizationId);
//
// If the call should reject, this helper RETURNS a ready-to-send Response
// (rather than throwing) so callers can `if (auth instanceof Response) return auth;`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export interface OrgAdminContext {
  user: { id: string; email?: string | null };
  supabaseAdmin: SupabaseClient;
  role: "owner" | "admin";
}

function jsonError(status: number, message: string, code?: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, errorCode: code ?? "unauthorized" }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Verify the request is from an owner/admin of `organizationId`.
 * Returns either an OrgAdminContext (success) or a Response (error to return).
 */
export async function requireOrgAdmin(
  req: Request,
  organizationId: string | null | undefined,
  opts: { allowMember?: boolean } = {}
): Promise<OrgAdminContext | Response> {
  if (!organizationId) {
    return jsonError(400, "organizationId is required", "missing_organization");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(401, "Authentication required", "missing_auth");
  }
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token.split(".").length !== 3) {
    return jsonError(401, "Invalid auth token", "invalid_token");
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonError(401, "Session expired. Please log in again.", "session_expired");
  }
  const user = userData.user;

  const { data: membership, error: mErr } = await supabaseAdmin
    .from("org_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (mErr || !membership) {
    return jsonError(403, "You do not have access to this organization.", "not_a_member");
  }

  const role = membership.role as string;
  const allowed = opts.allowMember
    ? ["owner", "admin", "member"].includes(role)
    : ["owner", "admin"].includes(role);

  if (!allowed) {
    return jsonError(403, "Admin permissions required for this action.", "insufficient_role");
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    supabaseAdmin,
    role: role as "owner" | "admin",
  };
}

export { corsHeaders as sharedCorsHeaders };
