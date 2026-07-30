import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClientPortal } from '@/contexts/ClientPortalContext';
import { readEdgeFunctionError } from '@/lib/edgeFunctionError';
import { normalizeOrgTierRows, toTierDefs, type OrgTier } from '@/lib/loyaltyTier';

// OrgTier and the row normalisation live in @/lib/loyaltyTier so the admin hook
// (useAdminOrgTiers, different transport — see there) shares them rather than
// keeping a second copy.
export type { OrgTier };

/**
 * This org's loyalty tiers, from client_tier_settings.
 *
 * Single source of truth for portal tier data. PortalProfileTab used to run its
 * own useState/useEffect copy of this fetch; both are now this hook.
 *
 * Goes through the `client-portal-api` proxy, NOT a direct supabase.rpc().
 * The client portal has no Supabase Auth session — it uses a custom
 * client_portal_users table, so every portal browser request is `anon`. The
 * underlying tier functions are granted to `authenticated`/`service_role`, so a
 * direct RPC would 401. organization_id is resolved from the *verified portal
 * session* server-side and is deliberately never sent from here.
 *
 * NOT persisted to the offline cache — see the dehydrate predicate in App.tsx.
 * A stale threshold would misreport a customer's tier, the same reasoning that
 * excludes service-pricing from persistence.
 *
 * Errors are surfaced, never swallowed into an empty array. This call used to be
 * `if (!error && data)` with no else; when the anon grant was revoked in May it
 * began failing with 42501 and the tiers section simply rendered empty — a
 * customer-facing feature was dead for three months because nothing said so.
 * `error` and "no tiers configured" must stay distinguishable.
 */
export function useOrgTiers() {
  const { invokePortal, user } = useClientPortal();
  const organizationId = user?.organization_id;

  const query = useQuery({
    queryKey: ['org-tiers', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<OrgTier[]> => {
      const { data, error } = await invokePortal<unknown[]>('client-portal-api', {
        body: { action: 'get_loyalty_tiers' },
      });

      if (error) {
        console.error('[useOrgTiers] loyalty tiers failed to load', error);
        // Resolve the friendly message here so consumers can render
        // `error.message` directly.
        throw new Error(await readEdgeFunctionError(error, "Couldn't load loyalty tiers."));
      }

      return normalizeOrgTierRows(data);
    },
  });

  // Narrow shape for computeTierProgress / tierProgressPercent.
  const tierDefs = useMemo(() => toTierDefs(query.data), [query.data]);

  return {
    /** Full rows — thresholds, benefits, colour, ordering. */
    tiers: query.data,
    /** Same tiers reduced to what the tier-math helpers need. */
    tierDefs,
    isLoading: query.isLoading,
    /** An Error whose message is already human-readable. */
    error: query.error as Error | null,
  };
}
