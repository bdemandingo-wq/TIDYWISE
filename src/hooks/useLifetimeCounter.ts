/**
 * useLifetimeCounter – returns the live state of the founding lifetime
 * offer (how many of the 50 spots are claimed, sold-out flag).
 *
 * Reads from lifetime_offer_state (public SELECT policy). Used by both
 * the dedicated pricing page and the homepage hero so the "X of 50
 * left" hook is consistent everywhere.
 *
 * Cached via React Query with a 30s stale time so the same data isn't
 * re-fetched on every mount — visiting / then /pricing was doing two
 * round-trips for the same row. With this cache the second mount
 * resolves instantly from memory.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LifetimeState {
  total: number;
  sold: number;
  spotsLeft: number;
  soldOut: boolean;
  loading: boolean;
}

const DEFAULT: LifetimeState = {
  total: 50,
  sold: 0,
  spotsLeft: 50,
  soldOut: false,
  loading: true,
};

interface LifetimeRow {
  total_spots: number | null;
  sold_spots: number | null;
  sold_out_at: string | null;
}

async function fetchLifetimeState(): Promise<LifetimeState> {
  const { data } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: number) => {
          maybeSingle: () => Promise<{ data: LifetimeRow | null }>;
        };
      };
    };
  })
    .from('lifetime_offer_state')
    .select('total_spots, sold_spots, sold_out_at')
    .eq('id', 1)
    .maybeSingle();
  const total = data?.total_spots ?? 50;
  const sold = data?.sold_spots ?? 0;
  return {
    total,
    sold,
    spotsLeft: Math.max(0, total - sold),
    soldOut: !!data?.sold_out_at || sold >= total,
    loading: false,
  };
}

export function useLifetimeCounter(): LifetimeState {
  const { data, isLoading } = useQuery({
    queryKey: ['lifetime-offer-state'],
    queryFn: fetchLifetimeState,
    // Counter doesn't change often. 30s is more than fast enough for
    // the social-proof use case ("X of 50 left") and avoids extra
    // round-trips when the user navigates between landing/pricing.
    staleTime: 30_000,
    // If the query errors, fall back to the default rather than
    // showing a permanent loading state on the pricing page.
    placeholderData: DEFAULT,
  });
  if (isLoading || !data) return DEFAULT;
  return data;
}
