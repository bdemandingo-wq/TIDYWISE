import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface StaffOrg {
  /** The cleaner's `staff` row id **in this org**. Unique per org. */
  staffId: string;
  organizationId: string;
  /** Falls back to a placeholder if the org row isn't readable. */
  name: string;
}

/**
 * The organizations the signed-in user can actually work in as a cleaner —
 * i.e. the ones they hold an active `staff` row for.
 *
 * This is deliberately NOT `useOrganization().allOrganizations`. That list comes
 * from `org_memberships`, and the two are not the same set: an owner or admin of
 * one business can be a member there while only being *staff* somewhere else.
 * Driving the staff portal off memberships is what makes it resolve to an org
 * the cleaner has no staff row in, which renders an empty portal with no
 * explanation. See StaffPortal's activeStaffOrg resolution.
 *
 * Readable client-side without a new RPC: the `staff` RLS policy
 * "Staff can view own record" is `user_id = auth.uid()` and is NOT org-scoped,
 * so a cleaner sees every one of their own rows. Verified against the live DB.
 *
 * Only non-revoked columns are selected. `staff` has column-level REVOKEs on
 * ssn_last4, ein, home_address, home_latitude, home_longitude, hourly_rate,
 * base_wage and tax_document_url for `authenticated` — selecting any of them
 * here would 403 the whole query.
 */
export function useMyStaffOrgs() {
  const { user } = useAuth();
  const { allOrganizations } = useOrganization();

  const query = useQuery({
    queryKey: ['my-staff-orgs', user?.id],
    enabled: !!user?.id,
    // No staleTime: refetch on every mount. This list changes underneath the
    // cleaner — an admin adds them to a second business while they are already
    // signed in — and a stale copy hides the switcher with no way for them to
    // know it should be there. Caching it for five minutes meant a cleaner
    // added during a launch had to be told to close and reopen the app.
    // It is one small select of two columns; correctness is worth more here
    // than the round trip.
    staleTime: 0,
    queryFn: async (): Promise<{ staffId: string; organizationId: string }[]> => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, organization_id')
        .eq('user_id', user!.id)
        .eq('is_active', true)
        // Oldest first: the first entry is the documented fallback when the
        // active org has no staff row, and it must match what
        // get_my_staff_profile(NULL) returns (ORDER BY created_at ASC LIMIT 1).
        .order('created_at', { ascending: true })
        // created_at is not unique, so page/limit order could still shuffle
        // between two rows created in the same transaction — the invite flow
        // creates staff and membership together. Tiebreak on the primary key.
        .order('id', { ascending: true });

      // No catch-to-empty: a failed lookup must not read as "you work for
      // nobody", which would hide the switcher and strand a dual-org cleaner
      // (CLAUDE.md rule 5).
      if (error) throw error;

      return (data ?? [])
        .filter((r): r is { id: string; organization_id: string } => !!r.organization_id)
        .map((r) => ({ staffId: r.id, organizationId: r.organization_id }));
    },
  });

  // Names come from the membership list, which the context has already loaded.
  // Every active staff row currently has a matching membership (verified: 0
  // rows without one), but the placeholder keeps a missing one from rendering
  // a blank menu entry rather than a nameless-but-selectable org.
  const staffOrgs: StaffOrg[] = (query.data ?? []).map((row) => ({
    ...row,
    name:
      allOrganizations.find((o) => o.organization.id === row.organizationId)?.organization.name ??
      'Your business',
  }));

  return {
    staffOrgs,
    isLoading: query.isLoading,
    error: query.error,
    /** Show a switcher only when there is something to switch between. */
    hasMultiple: staffOrgs.length > 1,
  };
}
