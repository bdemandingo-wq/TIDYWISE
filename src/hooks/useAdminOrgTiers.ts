import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { normalizeOrgTierRows, toTierDefs, type OrgTier } from '@/lib/loyaltyTier';

/**
 * This org's loyalty tiers, for ADMIN screens.
 *
 * Why this exists alongside useOrgTiers rather than being the same hook: the two
 * transports genuinely cannot be merged. The admin app runs as `authenticated`
 * and can call get_org_tiers directly (it is granted to authenticated and
 * authorizes internally via is_org_member). The client portal has no Supabase
 * Auth session at all — custom client_portal_users, every request is `anon` — so
 * it must go through the client-portal-api proxy. Only the transport differs;
 * the row mapping is shared via normalizeOrgTierRows.
 *
 * Why get_org_tiers rather than reading client_tier_settings directly, which
 * LoyaltyTierEditor does: this returns the built-in defaults for an org with no
 * rows of its own, which is exactly what resolve_customer_tier() falls back to
 * server-side. Display must match resolution, or an admin sees a tier the
 * resolver would not assign. LoyaltyTierEditor is right to query the table
 * directly instead — you edit your OWN rows, not the fallback.
 *
 * Excluded from the persisted query cache in App.tsx via the 'org-tiers' key
 * prefix: a stale threshold would misreport a customer's tier.
 */
export function useAdminOrgTiers() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;

  const query = useQuery({
    queryKey: ['org-tiers', 'admin', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<OrgTier[]> => {
      const { data, error } = await supabase.rpc('get_org_tiers', {
        p_organization_id: organizationId!,
      });
      // Surfaced, never swallowed into an empty array: "this org has no tiers"
      // and "the request failed" must stay distinguishable to the caller.
      if (error) throw error;
      return normalizeOrgTierRows(data as unknown[]);
    },
  });

  const tierDefs = useMemo(() => toTierDefs(query.data), [query.data]);

  return {
    /** Full rows, ascending by threshold — thresholds, benefits, colour, order. */
    tiers: query.data,
    /** Same tiers reduced to what the tier-math helpers need. */
    tierDefs,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
