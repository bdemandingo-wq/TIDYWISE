/**
 * useLifetimeCounter – returns the live state of the founding lifetime
 * offer (how many of the 50 spots are claimed, sold-out flag).
 *
 * Reads from lifetime_offer_state (public SELECT policy). Used by both
 * the dedicated pricing page and the homepage hero so the "X of 50
 * left" hook is consistent everywhere.
 */

import { useEffect, useState } from 'react';
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

export function useLifetimeCounter(): LifetimeState {
  const [state, setState] = useState<LifetimeState>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('lifetime_offer_state')
          .select('total_spots, sold_spots, sold_out_at')
          .eq('id', 1)
          .maybeSingle();
        if (cancelled) return;
        const total = data?.total_spots ?? 50;
        const sold = data?.sold_spots ?? 0;
        setState({
          total,
          sold,
          spotsLeft: Math.max(0, total - sold),
          soldOut: !!data?.sold_out_at || sold >= total,
          loading: false,
        });
      } catch {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
