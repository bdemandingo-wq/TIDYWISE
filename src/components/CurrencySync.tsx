import { useEffect } from 'react';
import { useOrgCurrency } from '@/hooks/useOrgCurrency';
import { setActiveCurrency } from '@/lib/activeCurrency';

/**
 * Mount once inside the OrganizationContext provider so the org's currency
 * preference is mirrored into the module-level active currency.
 * Renders nothing.
 */
export function CurrencySync(): null {
  const code = useOrgCurrency();
  useEffect(() => {
    setActiveCurrency(code);
  }, [code]);
  return null;
}
