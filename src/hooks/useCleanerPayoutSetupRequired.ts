import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * useCleanerPayoutSetupRequired — org-level switch for whether cleaners are
 * pushed through Stripe payout onboarding in the staff portal.
 *
 * Why: owners who pay their cleaners externally (cash/Zelle/Venmo/check)
 * were losing cleaners to a payout-setup nag they could never satisfy —
 * and at least one org cancelled over it. When the org turns the
 * requirement off, the staff portal hides the payout banner and replaces
 * the payouts tab content with a simple "your employer pays you directly"
 * note.
 *
 * Reads business_settings.require_cleaner_payout_setup. Defaults to TRUE
 * (current behavior) when the column/row is missing or the query errors,
 * so this is safe to ship ahead of the migration.
 */
export function useCleanerPayoutSetupRequired(organizationId: string | null | undefined): boolean {
  const { data } = useQuery({
    queryKey: ['cleaner-payout-setup-required', organizationId],
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('business_settings')
          .select('require_cleaner_payout_setup')
          .eq('organization_id', organizationId!)
          .maybeSingle();
        if (error) return true; // column not migrated yet → keep current behavior
        const value = (data as { require_cleaner_payout_setup?: boolean } | null)
          ?.require_cleaner_payout_setup;
        return value !== false;
      } catch {
        return true;
      }
    },
  });
  return data !== false;
}
