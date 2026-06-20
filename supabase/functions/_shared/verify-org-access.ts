// Shared helper: verify the caller is authorized to act on a specific
// organization. Accepts either:
//   1) The Supabase service role JWT (for trusted server-to-server calls
//      from other edge functions / cron jobs), OR
//   2) A user JWT whose owner is a member of the requested organization.
//
// Returns { ok: true } on success or { ok: false, status, error } on failure.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface VerifyOptions {
  /** Require the membership role to be 'owner' or 'admin'. Defaults to false. */
  requireAdmin?: boolean;
}

export interface VerifyResult {
  ok: true;
  /** 'service' for service-role calls, otherwise the authenticated user id. */
  callerId: string;
  isService: boolean;
}

export async function verifyOrgAccess(
  req: Request,
  organizationId: string,
  opts: VerifyOptions = {},
): Promise<VerifyResult | { ok: false; status: number; error: string }> {
  if (!organizationId || typeof organizationId !== "string") {
    return { ok: false, status: 400, error: "organizationId is required" };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  // Allow trusted server-to-server calls using the service role key.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) {
    return { ok: true, callerId: "service", isService: true };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  const userId = userData.user.id;

  const { data: membership, error: memErr } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (memErr) {
    return { ok: false, status: 500, error: "Failed to verify membership" };
  }
  if (!membership) {
    return { ok: false, status: 403, error: "Not a member of this organization" };
  }
  if (opts.requireAdmin && !["owner", "admin"].includes(membership.role)) {
    return { ok: false, status: 403, error: "Admin role required" };
  }

  return { ok: true, callerId: userId, isService: false };
}
