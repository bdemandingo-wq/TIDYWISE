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
  // Americas
  { code: 'USD', symbol: '$',    name: 'US Dollar',            locale: 'en-US', ambiguous: true },
  { code: 'CAD', symbol: 'CA$',  name: 'Canadian Dollar',      locale: 'en-CA', ambiguous: true },
  { code: 'MXN', symbol: 'MX$',  name: 'Mexican Peso',         locale: 'es-MX', ambiguous: true },
  { code: 'BRL', symbol: 'R$',   name: 'Brazilian Real',       locale: 'pt-BR' },
  { code: 'ARS', symbol: 'AR$',  name: 'Argentine Peso',       locale: 'es-AR', ambiguous: true },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso',         locale: 'es-CL', ambiguous: true },
  { code: 'COP', symbol: 'COL$', name: 'Colombian Peso',       locale: 'es-CO', ambiguous: true },
  { code: 'PEN', symbol: 'S/',   name: 'Peruvian Sol',         locale: 'es-PE' },
  { code: 'UYU', symbol: '$U',   name: 'Uruguayan Peso',       locale: 'es-UY', ambiguous: true },
  // Europe
  { code: 'EUR', symbol: '€',    name: 'Euro',                 locale: 'en-IE' },
  { code: 'GBP', symbol: '£',    name: 'British Pound',        locale: 'en-GB' },
  { code: 'CHF', symbol: 'Fr',   name: 'Swiss Franc',          locale: 'de-CH' },
  { code: 'NOK', symbol: 'kr',   name: 'Norwegian Krone',      locale: 'nb-NO', ambiguous: true },
  { code: 'SEK', symbol: 'kr',   name: 'Swedish Krona',        locale: 'sv-SE', ambiguous: true },
  { code: 'DKK', symbol: 'kr',   name: 'Danish Krone',         locale: 'da-DK', ambiguous: true },
  { code: 'ISK', symbol: 'kr',   name: 'Icelandic Króna',      locale: 'is-IS', ambiguous: true },
  { code: 'PLN', symbol: 'zł',   name: 'Polish Złoty',         locale: 'pl-PL' },
  { code: 'CZK', symbol: 'Kč',   name: 'Czech Koruna',         locale: 'cs-CZ' },
  { code: 'HUF', symbol: 'Ft',   name: 'Hungarian Forint',     locale: 'hu-HU' },
  { code: 'RON', symbol: 'lei',  name: 'Romanian Leu',         locale: 'ro-RO' },
  { code: 'BGN', symbol: 'лв',   name: 'Bulgarian Lev',        locale: 'bg-BG' },
  { code: 'HRK', symbol: 'kn',   name: 'Croatian Kuna',        locale: 'hr-HR' },
  { code: 'RSD', symbol: 'дин', name: 'Serbian Dinar',         locale: 'sr-RS' },
  { code: 'TRY', symbol: '₺',    name: 'Turkish Lira',         locale: 'tr-TR' },
  { code: 'UAH', symbol: '₴',    name: 'Ukrainian Hryvnia',    locale: 'uk-UA' },
  { code: 'RUB', symbol: '₽',    name: 'Russian Ruble',        locale: 'ru-RU' },
  // Middle East & Africa
  { code: 'AED', symbol: 'د.إ',  name: 'UAE Dirham',           locale: 'en-AE' },
  { code: 'SAR', symbol: '﷼',    name: 'Saudi Riyal',          locale: 'ar-SA', ambiguous: true },
  { code: 'QAR', symbol: 'ر.ق',  name: 'Qatari Riyal',         locale: 'ar-QA' },
  { code: 'KWD', symbol: 'د.ك',  name: 'Kuwaiti Dinar',        locale: 'ar-KW' },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar',       locale: 'ar-BH' },
  { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial',           locale: 'ar-OM' },
  { code: 'JOD', symbol: 'د.ا',  name: 'Jordanian Dinar',      locale: 'ar-JO' },
  { code: 'ILS', symbol: '₪',    name: 'Israeli Shekel',       locale: 'he-IL' },
  { code: 'EGP', symbol: 'E£',   name: 'Egyptian Pound',       locale: 'ar-EG' },
  { code: 'MAD', symbol: 'د.م.', name: 'Moroccan Dirham',      locale: 'ar-MA' },
  { code: 'ZAR', symbol: 'R',    name: 'South African Rand',   locale: 'en-ZA' },
  { code: 'NGN', symbol: '₦',    name: 'Nigerian Naira',       locale: 'en-NG' },
  { code: 'KES', symbol: 'KSh',  name: 'Kenyan Shilling',      locale: 'en-KE' },
  { code: 'GHS', symbol: '₵',    name: 'Ghanaian Cedi',        locale: 'en-GH' },
  // Asia
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen',         locale: 'ja-JP', ambiguous: true },
  { code: 'CNY', symbol: '¥',    name: 'Chinese Yuan',         locale: 'zh-CN', ambiguous: true },
  { code: 'HKD', symbol: 'HK$',  name: 'Hong Kong Dollar',     locale: 'en-HK', ambiguous: true },
  { code: 'TWD', symbol: 'NT$',  name: 'Taiwan Dollar',        locale: 'zh-TW', ambiguous: true },
  { code: 'KRW', symbol: '₩',    name: 'South Korean Won',     locale: 'ko-KR' },
  { code: 'SGD', symbol: 'S$',   name: 'Singapore Dollar',     locale: 'en-SG', ambiguous: true },
  { code: 'MYR', symbol: 'RM',   name: 'Malaysian Ringgit',    locale: 'ms-MY' },
  { code: 'THB', symbol: '฿',    name: 'Thai Baht',            locale: 'th-TH' },
  { code: 'IDR', symbol: 'Rp',   name: 'Indonesian Rupiah',    locale: 'id-ID' },
  { code: 'PHP', symbol: '₱',    name: 'Philippine Peso',      locale: 'en-PH' },
  { code: 'VND', symbol: '₫',    name: 'Vietnamese Dong',      locale: 'vi-VN' },
  { code: 'INR', symbol: '₹',    name: 'Indian Rupee',         locale: 'en-IN' },
  { code: 'PKR', symbol: '₨',    name: 'Pakistani Rupee',      locale: 'en-PK', ambiguous: true },
  { code: 'BDT', symbol: '৳',    name: 'Bangladeshi Taka',     locale: 'bn-BD' },
  { code: 'LKR', symbol: 'Rs',   name: 'Sri Lankan Rupee',     locale: 'en-LK', ambiguous: true },
  { code: 'NPR', symbol: 'Rs',   name: 'Nepalese Rupee',       locale: 'ne-NP', ambiguous: true },
  // Oceania
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar',    locale: 'en-AU', ambiguous: true },
  { code: 'NZD', symbol: 'NZ$',  name: 'New Zealand Dollar',   locale: 'en-NZ', ambiguous: true },
  { code: 'FJD', symbol: 'FJ$',  name: 'Fijian Dollar',        locale: 'en-FJ', ambiguous: true },
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
