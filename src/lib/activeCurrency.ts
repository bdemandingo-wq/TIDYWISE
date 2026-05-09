/**
 * Module-level "active currency" — reflects the current organization's
 * configured currency. Synced by <CurrencySync/> at the App root,
 * which calls setActiveCurrency() whenever useOrgCurrency() resolves.
 *
 * This lets non-hook helpers and template-literal call sites format money
 * via a simple `fmt(amount)` without each one having to call a hook.
 *
 * Hook-free reads will return USD until the org currency is loaded.
 */

import { formatCurrency, type FormatCurrencyOptions, getCurrencySymbol } from '@/lib/currency';

type Listener = (code: string) => void;
let active = 'USD';
const listeners = new Set<Listener>();

export function setActiveCurrency(code: string | null | undefined) {
  const next = (code || 'USD').toUpperCase();
  if (next === active) return;
  active = next;
  listeners.forEach((l) => l(active));
}

export function getActiveCurrency(): string {
  return active;
}

export function subscribeActiveCurrency(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Format a number using the org's active currency. */
export function fmt(amount: number | null | undefined, options?: FormatCurrencyOptions): string {
  return formatCurrency(amount, active, options);
}

/** Just the symbol (e.g. "£"). Useful for prefix labels in inputs. */
export function sym(): string {
  return getCurrencySymbol(active);
}
