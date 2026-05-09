import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { formatCurrency as fmt, getCurrency, type FormatCurrencyOptions } from '@/lib/currency';

const DEFAULT_CURRENCY = 'USD';

/**
 * Returns the org's selected ISO 4217 currency code (defaults to USD).
 * Mirrors the pattern of useOrgTimezone.
 */
export function useOrgCurrency(): string {
  const { organization } = useOrganization();

  const { data: currency } = useQuery({
    queryKey: ['org-currency', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return DEFAULT_CURRENCY;
      const { data, error } = await supabase
        .from('business_settings')
        .select('currency')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error || !data?.currency) return DEFAULT_CURRENCY;
      return data.currency as string;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 10,
  });

  return currency || DEFAULT_CURRENCY;
}

/**
 * Convenience hook returning a memo-stable formatter bound to the org currency.
 * Usage:  const { format, code, symbol } = useCurrencyFormatter();
 *         format(190) // "£190.00"
 */
export function useCurrencyFormatter() {
  const code = useOrgCurrency();
  const info = getCurrency(code);
  return {
    code,
    symbol: info.symbol,
    info,
    format: (amount: number | null | undefined, options?: FormatCurrencyOptions) =>
      fmt(amount, code, options),
  };
}
