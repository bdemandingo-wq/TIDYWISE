import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  configFromBusinessSettings,
  HARDCODED_DEFAULTS,
  type RecurringDiscountConfig,
} from '@/lib/recurringDiscount';

/**
 * Loads the per-org recurring-discount config from business_settings. Falls
 * back to HARDCODED_DEFAULTS if the row or columns are missing so legacy
 * pricing keeps working during migration windows.
 */
export function useRecurringDiscounts(): {
  config: RecurringDiscountConfig;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { organization } = useOrganization();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recurring-discounts', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from('business_settings')
        .select(
          'recurring_discount_one_time, recurring_discount_monthly, recurring_discount_biweekly, recurring_discount_weekly',
        )
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 5,
  });

  // Cast through unknown — the generated Supabase types don't yet include
  // the recurring_discount_* columns (migration applies on deploy and types
  // get regenerated then). Behavior is unchanged; the cast is purely TS.
  return {
    config: data
      ? configFromBusinessSettings(data as unknown as Parameters<typeof configFromBusinessSettings>[0])
      : HARDCODED_DEFAULTS,
    loading: isLoading,
    error: (error as Error | null),
    refetch: () => void refetch(),
  };
}
