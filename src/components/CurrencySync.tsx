import { useEffect } from 'react';
import { useOrgCurrency } from '@/hooks/useOrgCurrency';
import { setActiveCurrency } from '@/lib/activeCurrency';

/**
 * Mount once inside the OrganizationContext provider so the org's currency
 * preference is mirrored into the module-level active currency.
 *
 * SAFETY: this component renders ABOVE every ErrorBoundary in the tree
 * (App.tsx:279). It must never throw. If the currency query fails, we
 * leave the previously-set active currency alone rather than overwriting
 * it with the fallback — a stale correct currency beats a fresh wrong one.
 */
export function CurrencySync(): null {
  const { currency, error } = useOrgCurrency();
  useEffect(() => {
    // Only update the global currency when the fetch succeeded.
    // On error, keep whatever was previously set (either a cached correct
    // value from a prior session, or USD if this is the very first load).
    if (!error) {
      setActiveCurrency(currency);
    }
  }, [currency, error]);
  return null;
}
