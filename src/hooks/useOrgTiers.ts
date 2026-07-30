import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClientPortal } from '@/contexts/ClientPortalContext';
import { readEdgeFunctionError } from '@/lib/edgeFunctionError';
import type { TierDef } from '@/lib/loyaltyTier';

/** A row from client_tier_settings, as returned by get_loyalty_tier_info. */
export interface OrgTier {
  tier_name: string;
  tier_order: number;
  /** Lifetime spend in DOLLARS at which this tier starts. Not points. */
  min_spending: number;
  /** Upper bound in dollars, or null for the top tier. */
  max_spending: number | null;
  /** Always an array here — see the normalisation in queryFn. */
  benefits: string[];
  color: string;
}

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

      return (data ?? []).map((raw) => {
        const t = raw as Record<string, unknown>;

        // benefits is stored as either jsonb (already an array) or a stringified
        // JSON array. Bad data must not crash the whole profile tab.
        let benefits: string[] = [];
        if (Array.isArray(t.benefits)) {
          benefits = t.benefits as string[];
        } else if (typeof t.benefits === 'string') {
          try {
            const parsed = JSON.parse(t.benefits);
            if (Array.isArray(parsed)) benefits = parsed as string[];
          } catch (err) {
            console.warn(
              `[useOrgTiers] corrupt benefits for tier ${String(t.tier_name ?? '(unnamed)')}`,
              err,
            );
          }
        }

        return {
          tier_name: String(t.tier_name ?? ''),
          tier_order: Number(t.tier_order ?? 0),
          min_spending: Number(t.min_spending ?? 0),
          max_spending: t.max_spending === null || t.max_spending === undefined
            ? null
            : Number(t.max_spending),
          benefits,
          color: String(t.color ?? ''),
        };
      });
    },
  });

  // Narrow shape for computeTierProgress / tierProgressPercent.
  const tierDefs = useMemo<TierDef[] | undefined>(
    () => query.data?.map((t) => ({ name: t.tier_name, minSpending: t.min_spending })),
    [query.data],
  );

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
