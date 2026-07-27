/**
 * useDistanceUnit – which unit to render distances in for this org.
 *
 * Reads organizations.country_code, which is populated opportunistically
 * from Google Places (see src/lib/orgCountry.ts) and defaults to 'US'.
 *
 * Only three countries use miles for road distance. Everyone else gets km,
 * so the safe default for an unrecognised or missing country is km — but
 * country_code itself defaults to 'US', so an org that has never resolved
 * an address still sees miles rather than silently flipping.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from './useOrgId';
import type { DistanceUnit } from '@/lib/distanceUtils';

const MILE_COUNTRIES = new Set(['US', 'LR', 'MM']);

export function useDistanceUnit(): DistanceUnit {
  const { organizationId } = useOrgId();

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

  // Before the lookup resolves, fall back to miles rather than flipping the
  // UI to km and back — country_code defaults to 'US' anyway.
  if (!data) return 'mi';
  return MILE_COUNTRIES.has(data.toUpperCase()) ? 'mi' : 'km';
}
