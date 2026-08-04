import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExtraOption } from '@/lib/bookingExtras';

/**
 * The organisation's add-on catalogue — the slug → label mapping the customer
 * saw when they booked.
 *
 * Ordered `created_at ASC, id ASC` and takes the first row that actually has
 * extras. Eleven organisations have more than one `service_pricing` row
 * carrying extras, and their rows disagree with each other — at one org today
 * two rows map different slugs to "Inside Oven". So "which row" has to be a
 * decision, not whatever Postgres returns first (CLAUDE.md rule 3).
 *
 * `created_at` alone is not unique, hence the id tiebreaker.
 *
 * Note this can differ from the label the customer saw: the public booking
 * form reads the same table through `public-booking-data`, which selects with
 * no ORDER BY at all, so its "first" row is arbitrary. usePublicOrgPricing now
 * sorts client-side with this same rule, which converges the two for orgs
 * whose rows all arrive in one response. Making the edge function order its
 * query is the remaining half and lives in Lovable's territory.
 */
export function useOrgExtrasCatalogue(organizationId: string | null | undefined) {
  return useQuery<ExtraOption[]>({
    queryKey: ['org-extras-catalogue', organizationId],
    enabled: !!organizationId,
    // Changes about as often as an org rewrites its price list.
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_pricing')
        .select('id, extras, created_at')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });

      // No catch-to-empty: an empty catalogue is indistinguishable from a
      // failed one at the call site, and the fallback silently mislabels
      // add-ons rather than showing nothing (CLAUDE.md rule 5).
      if (error) throw error;

      for (const row of data ?? []) {
        const raw = (row as { extras?: unknown }).extras;
        if (Array.isArray(raw) && raw.length > 0) {
          return raw
            .filter((e): e is { id: string; name: string } =>
              !!e && typeof e === 'object' &&
              typeof (e as { id?: unknown }).id === 'string' &&
              typeof (e as { name?: unknown }).name === 'string')
            .map((e) => ({ id: e.id, name: e.name }));
        }
      }

      // No org catalogue — callers fall back to the default one.
      return [];
    },
  });
}
