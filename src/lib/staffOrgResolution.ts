export interface StaffOrgLike {
  staffId: string;
  organizationId: string;
  name: string;
}

export interface ResolvedStaffOrg<T extends StaffOrgLike> {
  /** The business whose jobs should be on screen. Null only when they staff none. */
  activeStaffOrg: T | null;
  /**
   * True when the app-wide active org had to be overridden because this user
   * holds no staff row there. The caller must say so on screen — silently
   * showing a different business's jobs is worse than the empty portal it
   * replaces.
   */
  usingFallbackOrg: boolean;
}

/**
 * Decide which business the staff portal should show.
 *
 * `contextOrgId` is the app-wide active org (OrganizationContext, persisted to
 * localStorage and shared with the admin sidebar). It is a *preference*, not an
 * authority: it resolves from `org_memberships` with an owner/admin-first
 * priority, so it can point at a business where this user is an owner and not a
 * cleaner. `staffOrgs` is the authority — one entry per active `staff` row.
 *
 * Extracted from StaffPortal so the precedence is testable on its own; the
 * failure it guards against (an empty portal with no explanation) is invisible
 * in a rendered snapshot.
 *
 * `staffOrgs` must be ordered oldest-first so index 0 matches what
 * `get_my_staff_profile(NULL)` returns (ORDER BY created_at ASC LIMIT 1) — the
 * fallback and the RPC's own default must not disagree.
 */
export function resolveActiveStaffOrg<T extends StaffOrgLike>(
  staffOrgs: T[],
  contextOrgId: string | null | undefined
): ResolvedStaffOrg<T> {
  const match = staffOrgs.find((o) => o.organizationId === contextOrgId);
  if (match) return { activeStaffOrg: match, usingFallbackOrg: false };

  const fallback = staffOrgs[0] ?? null;
  return {
    activeStaffOrg: fallback,
    // Not a fallback if there was no preference yet (first load, before the
    // context resolves) or if they staff nothing at all — in neither case is
    // there a mismatch worth explaining to the user.
    usingFallbackOrg: !!contextOrgId && !!fallback,
  };
}
