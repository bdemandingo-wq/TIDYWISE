import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CustomFrequencyRow {
  id: string;
  name: string;
  interval_days: number;
  days_of_week: number[] | null;
  is_active: boolean;
  discount_pct: number;
}

/**
 * Loads the active custom recurring frequencies for the given organization.
 * Each row can carry its own discount percentage that both booking forms
 * (admin + public) honor when the frequency is selected.
 */
export function useCustomFrequencies(organizationId: string | null | undefined) {
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['custom-frequencies-active', organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as CustomFrequencyRow[];
      const { data, error } = await supabase
        .from('custom_frequencies')
        .select('id, name, interval_days, days_of_week, is_active, discount_pct')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('interval_days', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CustomFrequencyRow[];
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60,
  });

  return { customFrequencies: data, loading: isLoading, refetch };
}

/**
 * Resolves the discount % (0-99) for a custom-frequency selection.
 * Supports id shapes used across the app:
 *   - "custom:<uuid>"        → direct id match (public form card)
 *   - "custom_days_<uuid>"   → direct id match (admin form select)
 *   - "custom_<intervalDays>"→ interval match  (admin form select)
 *   - "custom"               → look up by matching interval_days / days_of_week
 *                              (admin form legacy path via supporting fields)
 */
export function resolveCustomFrequencyDiscountPct(params: {
  frequencyId: string | null | undefined;
  customFrequencyDays?: number | null;
  recurringDaysOfWeek?: number[] | null;
  customFrequencies: CustomFrequencyRow[];
}): number {
  const { frequencyId, customFrequencyDays, recurringDaysOfWeek, customFrequencies } = params;
  if (!frequencyId || !customFrequencies?.length) return 0;

  if (frequencyId.startsWith('custom:')) {
    const id = frequencyId.slice('custom:'.length);
    return customFrequencies.find((r) => r.id === id)?.discount_pct ?? 0;
  }

  if (frequencyId.startsWith('custom_days_')) {
    const id = frequencyId.slice('custom_days_'.length);
    return customFrequencies.find((r) => r.id === id)?.discount_pct ?? 0;
  }

  if (frequencyId.startsWith('custom_') && frequencyId !== 'custom') {
    const n = parseInt(frequencyId.slice('custom_'.length), 10);
    if (!Number.isNaN(n)) {
      const row = customFrequencies.find(
        (r) => (!r.days_of_week || r.days_of_week.length === 0) && r.interval_days === n,
      );
      return row?.discount_pct ?? 0;
    }
  }

  if (frequencyId === 'custom') {
    if (recurringDaysOfWeek && recurringDaysOfWeek.length > 0) {
      const key = [...recurringDaysOfWeek].sort().join(',');
      const row = customFrequencies.find(
        (r) =>
          r.days_of_week &&
          r.days_of_week.length > 0 &&
          [...r.days_of_week].sort().join(',') === key,
      );
      return row?.discount_pct ?? 0;
    }
    if (customFrequencyDays != null) {
      const row = customFrequencies.find(
        (r) => (!r.days_of_week || r.days_of_week.length === 0) && r.interval_days === customFrequencyDays,
      );
      return row?.discount_pct ?? 0;
    }
  }

  return 0;
}
