import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * The loyalty tier a customer has actually earned, resolved SERVER-SIDE.
 *
 * `resolve_customer_tier` is SECURITY DEFINER: it reads customer_loyalty
 * .lifetime_spend and matches it against the org's client_tier_settings. The
 * caller cannot influence the answer — it is derived from spend, not passed in.
 * That is the whole reason this is worth showing: an admin looking at a booking
 * is seeing what the customer has earned, not a label someone typed.
 *
 * ACCESS: the function requires service_role OR org membership, and raises
 * otherwise. So this hook is for ADMIN surfaces only. The client portal gets the
 * same value by a different route — ClientPortalContext.loyalty_tier, populated
 * by the portal RPC which runs as service_role. Do not reach for this hook
 * there; it will throw.
 *
 * Returns null for a customer below the org's lowest tier, and for a booking
 * with no customer yet (a new customer being typed in has no history to score).
 */
export function useCustomerTier(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['customer-tier', customerId],
    enabled: Boolean(customerId),
    // Spend only changes when a booking completes, so this is stable within a
    // session. Long staleTime keeps the booking form from re-querying on every
    // step change.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('resolve_customer_tier', {
        p_customer_id: customerId as string,
      });
      // Deliberately NOT swallowed into null (CLAUDE.md rule 5): "no tier" and
      // "the lookup failed" look identical in the UI otherwise, and this drives
      // a badge an admin may act on.
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}
