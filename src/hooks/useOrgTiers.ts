import { useQuery } from '@tanstack/react-query';
import { useClientPortal } from '@/contexts/ClientPortalContext';
import type { TierDef } from '@/lib/loyaltyTier';

interface OrgTierRow {
  tier_name: string;
  tier_order: number;
  min_spending: number | string;
  max_spending: number | string | null;
  benefits: unknown;
  color: string | null;
}

/**
 * This org's loyalty tiers, from client_tier_settings.
 *
 * Goes through the `client-portal-api` proxy, NOT a direct supabase.rpc().
 * The client portal has no Supabase Auth session — it uses a custom
 * client_portal_users table, so every portal browser request is `anon`. The
 * underlying tier functions are granted to `authenticated`/`service_role`, so a
 * direct RPC would 401. The proxy resolves organization_id from the *verified
 * portal session* rather than anything client-supplied.
 *
 * NOT persisted to the offline cache — see the dehydrate predicate in App.tsx.
 * A stale threshold would misreport a customer's tier, which is the same
 * reasoning that excludes service-pricing from persistence.
 *
 * Errors are surfaced, never swallowed into an empty array: an org with no
 * configured tiers and a failed request are different states, and the banner
 * must be able to tell them apart.
 */
export function useOrgTiers() {
  const { invokePortal, user } = useClientPortal();
  const organizationId = user?.organization_id;

  const query = useQuery({
    queryKey: ['org-tiers', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<TierDef[]> => {
      // organization_id is deliberately NOT sent — the edge function takes it
      // from the verified session.
      const { data, error } = await invokePortal<OrgTierRow[]>('client-portal-api', {
        body: { action: 'get_loyalty_tiers' },
      });
      if (error) throw error;

      return (data ?? []).map((r) => ({
        name: r.tier_name,
        minSpending: Number(r.min_spending),
      }));
    },
  });

  return {
    tiers: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
