/**
 * Full IANA timezone catalog with current offset for display.
 * Uses Intl.supportedValuesOf when available, with a curated fallback.
 */

const FALLBACK_TIMEZONES = [
  'Africa/Cairo','Africa/Johannesburg','Africa/Lagos','Africa/Nairobi',
  'America/Anchorage','America/Argentina/Buenos_Aires','America/Bogota',
  'America/Chicago','America/Denver','America/Halifax','America/Lima',
  'America/Los_Angeles','America/Mexico_City','America/New_York',
  'America/Phoenix','America/Santiago','America/Sao_Paulo','America/Toronto',
  'America/Vancouver','Asia/Bangkok','Asia/Dubai','Asia/Hong_Kong',
  'Asia/Jakarta','Asia/Karachi','Asia/Kolkata','Asia/Manila','Asia/Riyadh',
  'Asia/Seoul','Asia/Shanghai','Asia/Singapore','Asia/Taipei','Asia/Tehran',
  'Asia/Tokyo','Atlantic/Reykjavik','Australia/Adelaide','Australia/Brisbane',
  'Australia/Melbourne','Australia/Perth','Australia/Sydney','Europe/Amsterdam',
  'Europe/Athens','Europe/Berlin','Europe/Brussels','Europe/Bucharest',
  'Europe/Budapest','Europe/Copenhagen','Europe/Dublin','Europe/Helsinki',
  'Europe/Istanbul','Europe/Lisbon','Europe/London','Europe/Madrid',
  'Europe/Moscow','Europe/Oslo','Europe/Paris','Europe/Prague','Europe/Rome',
  'Europe/Stockholm','Europe/Vienna','Europe/Warsaw','Europe/Zurich',
  'Pacific/Auckland','Pacific/Fiji','Pacific/Honolulu','UTC',
];

let cached: string[] | null = null;

export function getAllTimezones(): string[] {
  if (cached) return cached;
  try {
    const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    if (typeof anyIntl.supportedValuesOf === 'function') {
      cached = anyIntl.supportedValuesOf('timeZone').slice().sort();
      return cached;
    }
  } catch {}
  cached = FALLBACK_TIMEZONES.slice().sort();
  return cached;
}

/** Returns "GMT-05:00" style offset for the given timezone right now. */
export function getTimezoneOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const off = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return off || '';
  } catch {
    return '';
  }
}

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}
