import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { formatCurrency as fmtCurrency, getCurrency, type FormatCurrencyOptions } from '@/lib/currency';
import { Sentry } from '@/lib/sentry';

const DEFAULT_CURRENCY = 'USD';

export interface OrgCurrencyResult {
  currency: string;
  /** Non-null when the fetch failed. The currency value is a fallback. */
  error: Error | null;
  /** True when the returned currency is the default, not the org's configured value. */
  isFallback: boolean;
}

/**
 * Returns the org's selected ISO 4217 currency code.
 * Falls back to USD if not configured (isFallback = false) or if the fetch
 * failed (isFallback = true, error is set).
 */
export function useOrgCurrency(): OrgCurrencyResult {
  const { organization } = useOrganization();

  const { data: currency, error } = useQuery({
    queryKey: ['org-currency', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return DEFAULT_CURRENCY;
      const { data, error: fetchError } = await supabase
        .from('business_settings')
        .select('currency')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (fetchError) {
        Sentry.captureException(fetchError, {
          tags: { hook: 'useOrgCurrency', organizationId: organization.id },
        });
        throw fetchError;
      }
      if (!data?.currency) return DEFAULT_CURRENCY;
      return data.currency as string;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 10,
  });

  const resolvedError = error as Error | null;
  return {
    currency: currency || DEFAULT_CURRENCY,
    error: resolvedError,
    isFallback: resolvedError != null || !currency,
  };
}

/**
 * Convenience hook returning a memo-stable formatter bound to the org currency.
 * Usage:  const { format, code, symbol } = useCurrencyFormatter();
 *         format(190) // "£190.00"
 */
export function useCurrencyFormatter() {
  const { currency: code } = useOrgCurrency();
  const info = getCurrency(code);
  return {
    code,
    symbol: info.symbol,
    info,
    format: (amount: number | null | undefined, options?: FormatCurrencyOptions) =>
      fmtCurrency(amount, code, options),
  };
}
