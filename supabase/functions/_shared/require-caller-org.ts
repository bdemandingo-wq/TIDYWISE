// Shared helpers for locking down functions that used to trust a
// client-supplied organizationId with no check that the caller actually
// belongs to that org.
//
// Two building blocks:
//   - isServiceRoleRequest(req): true only for genuine service-role callers
//     (other edge functions, cron). Use to gate server-to-server-only functions.
//   - resolveCallerOrg(req): validates the caller's JWT and returns the
//     organizationId derived from THEIR OWN org_memberships (owner-first) or,
//     if they have no org_memberships row, their `staff` record. Never trusts
//     an organizationId/organization_id passed in the request body.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isServiceRoleRequest(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const claims = parseJwtClaims(authHeader.slice("Bearer ".length).trim());
  return claims?.role === "service_role";
}

export interface CallerOrgContext {
  userId: string;
  organizationId: string;
}

/**
 * Resolves the organization the CALLER belongs to, from their own JWT —
 * never from the request body. Checks org_memberships first (owner role
 * preferred, otherwise first membership); if the caller has no
 * org_memberships row at all (staff-portal accounts don't), falls back to
 * their `staff` record.
 */
export async function resolveCallerOrg(
  req: Request,
): Promise<{ ok: true; ctx: CallerOrgContext } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = authHeader.slice("Bearer ".length).trim();

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid token" };
  }
  const userId = userData.user.id;

  const { data: memberships } = await supabaseAdmin
    .from("org_memberships")
    .select("organization_id, role")
    .eq("user_id", userId);

  if (memberships && memberships.length > 0) {
    const owner = memberships.find((m: { role: string }) => m.role === "owner");
    const organizationId = (owner ?? memberships[0]).organization_id as string;
    return { ok: true, ctx: { userId, organizationId } };
  }

  // No admin-dashboard membership — check for a staff-portal record.
  const { data: staffRow } = await supabaseAdmin
    .from("staff")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (staffRow?.organization_id) {
    return { ok: true, ctx: { userId, organizationId: staffRow.organization_id as string } };
  }

  return { ok: false, status: 403, error: "No organization membership found for this account" };
}
