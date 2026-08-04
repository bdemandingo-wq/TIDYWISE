import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Hook to fetch the organization's configured timezone from business_settings.
 * Falls back to America/New_York if not configured.
 *
 * @param orgIdOverride Resolve the timezone for this org instead of the one in
 *   OrganizationContext. Staff surfaces must pass it.
 *
 *   A cleaner is a row in `staff`, not necessarily a member of the org they are
 *   currently working in, and OrganizationContext resolves from `org_memberships`
 *   with an admin-first role priority. For a cleaner staffed at two businesses
 *   the context org and the staff row's org can differ, and reading the context
 *   here would render one employer's job times in the other's timezone — the
 *   same silent-default failure CleanerEarnings already works around by hand.
 *
 *   Mirrors the override useDistanceUnit already takes, for the same reason.
 */
export function useOrgTimezone(orgIdOverride?: string | null): string {
  const { organization } = useOrganization();
  // An explicit null/undefined override still falls through to the context, so
  // existing callers are unaffected; staff callers always pass a real id.
  const organizationId = orgIdOverride ?? organization?.id ?? null;

  const { data: timezone } = useQuery({
    queryKey: ['org-timezone', organizationId],
    queryFn: async () => {
      if (!organizationId) return DEFAULT_TIMEZONE;
      const { data, error } = await supabase
        .from('business_settings')
        .select('timezone')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error || !data?.timezone) return DEFAULT_TIMEZONE;
      return data.timezone;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 10, // cache for 10 minutes
  });

  return timezone || DEFAULT_TIMEZONE;
}
