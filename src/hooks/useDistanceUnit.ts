/**
 * Org country_code, and the two things that depend on it.
 *
 * organizations.country_code is populated opportunistically from Google
 * Places (see src/lib/orgCountry.ts) and defaults to 'US'.
 *
 * Two consumers, one query — do not add a second read path:
 *   useOrgCountryCode  raw ISO-2, passed to geocode-address so a non-US org
 *                      stops getting US-only results for hand-typed addresses
 *   useDistanceUnit    miles vs km for display
 *
 * Both share a react-query cache key, so an admin screen doing both makes a
 * single request. Callers that already hold an explicit organization id
 * (staff-side components, where OrganizationContext isn't populated) pass it
 * in rather than relying on useOrgId.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from './useOrgId';
import type { DistanceUnit } from '@/lib/distanceUtils';

const MILE_COUNTRIES = new Set(['US', 'LR', 'MM']);

/**
 * @param orgIdOverride use when the caller holds the org id directly — staff
 *        portal surfaces don't have OrganizationContext populated.
 */
export function useOrgCountryCode(orgIdOverride?: string | null): string | null {
  const { organizationId: contextOrgId } = useOrgId();
  const organizationId = orgIdOverride ?? contextOrgId;

  const { data } = useQuery({
    queryKey: ['org-country-code', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('country_code')
        .eq('id', organizationId)
        .maybeSingle();
      if (error) return null;
      return (data as { country_code?: string } | null)?.country_code ?? null;
    },
    enabled: !!organizationId,
    staleTime: 30 * 60 * 1000,
  });

  return data ? data.toUpperCase() : null;
}

export function useDistanceUnit(orgIdOverride?: string | null): DistanceUnit {
  const country = useOrgCountryCode(orgIdOverride);

  // Before the lookup resolves, fall back to miles rather than flipping the
  // UI to km and back — country_code defaults to 'US' anyway.
  if (!country) return 'mi';
  return MILE_COUNTRIES.has(country) ? 'mi' : 'km';
}
