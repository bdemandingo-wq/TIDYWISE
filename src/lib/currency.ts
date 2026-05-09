/**
 * Currency catalog and formatting helpers.
 * The org's currency is stored in business_settings.currency (ISO 4217 code).
 */

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  /** True when symbol alone is ambiguous (e.g. $ shared by USD/CAD/AUD/MXN/NZD/SGD). */
  ambiguous?: boolean;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$',   name: 'US Dollar',          locale: 'en-US', ambiguous: true },
  { code: 'GBP', symbol: '£',   name: 'British Pound',      locale: 'en-GB' },
  { code: 'EUR', symbol: '€',   name: 'Euro',               locale: 'en-IE' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar',    locale: 'en-CA', ambiguous: true },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar',  locale: 'en-AU', ambiguous: true },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ', ambiguous: true },
  { code: 'ZAR', symbol: 'R',   name: 'South African Rand', locale: 'en-ZA' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',         locale: 'en-AE' },
  { code: 'SGD', symbol: 'S$',  name: 'Singapore Dollar',   locale: 'en-SG', ambiguous: true },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc',        locale: 'de-CH' },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen',       locale: 'ja-JP' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso',       locale: 'es-MX', ambiguous: true },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',       locale: 'en-IN' },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code?: string | null): CurrencyInfo {
  if (!code) return BY_CODE.get('USD')!;
  return BY_CODE.get(code.toUpperCase()) ?? BY_CODE.get('USD')!;
}

export function getCurrencySymbol(code?: string | null): string {
  return getCurrency(code).symbol;
}

export interface FormatCurrencyOptions {
  /** Append ISO code, e.g. "£190.00 GBP". Useful for ambiguous symbols. */
  showCode?: boolean;
  /** Override decimal digits. */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Render no-fraction whole amounts (e.g. "$1,200" instead of "$1,200.00"). */
  compact?: boolean;
}

/**
 * Format a numeric amount in the given currency code using Intl.
 * Falls back gracefully to USD when code is unknown.
 */
export function formatCurrency(
  amount: number | null | undefined,
  code?: string | null,
  options: FormatCurrencyOptions = {}
): string {
  const value = Number.isFinite(amount as number) ? (amount as number) : 0;
  const info = getCurrency(code);

  const fractionDigits = options.compact && Number.isInteger(value)
    ? 0
    : undefined;

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: info.code,
      minimumFractionDigits: options.minimumFractionDigits ?? fractionDigits,
      maximumFractionDigits: options.maximumFractionDigits ?? fractionDigits,
    }).format(value);
  } catch {
    formatted = `${info.symbol}${value.toFixed(2)}`;
  }

  if (options.showCode) {
    return `${formatted} ${info.code}`;
  }
  return formatted;
}

/**
 * Suggest a currency code from the browser locale (best-effort).
 */
export function detectBrowserCurrency(): string {
  try {
    const locale = navigator.language || 'en-US';
    const region = new Intl.Locale(locale).maximize().region;
    const REGION_TO_CURRENCY: Record<string, string> = {
      US: 'USD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR',
      IT: 'EUR', NL: 'EUR', PT: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR',
      CA: 'CAD', AU: 'AUD', NZ: 'NZD', ZA: 'ZAR', AE: 'AED', SG: 'SGD',
      CH: 'CHF', JP: 'JPY', MX: 'MXN', IN: 'INR',
    };
    if (region && REGION_TO_CURRENCY[region]) return REGION_TO_CURRENCY[region];
  } catch {}
  return 'USD';
}
