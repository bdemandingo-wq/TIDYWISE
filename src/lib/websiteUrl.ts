/**
 * Website URL normalisation and safety checks.
 *
 * business_settings.website_url is operator-typed text that ends up as an
 * href on the PUBLIC booking form — a page anonymous visitors load. A
 * `javascript:` or `data:` value there is stored XSS against every visitor
 * to that org's form. Admin-only write access does not make it safe: it
 * survives account compromise and it is a self-XSS vector regardless.
 *
 * Three layers guard it, deliberately redundant:
 *   1. normalizeWebsiteUrl on input      (Settings)
 *   2. isSafeHttpUrl at render           (PublicBookingPage)
 *   3. a CHECK constraint on the column  (migration)
 *
 * Layer 2 exists because the render path must not trust what is in the
 * database. Do not remove it on the grounds that layer 1 already ran.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Turn what someone typed into a safe absolute URL, or null if it can't be
 * one. "mysite.com" becomes "https://mysite.com/".
 */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Protocol-relative ("//evil.com") inherits the page's scheme and reads to
  // a human like a bare hostname. Reject rather than guess.
  if (trimmed.startsWith('//')) return null;

  // Any explicit scheme that isn't http(s) is rejected outright. This is the
  // javascript:/data: guard — do not relax it.
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch && !ALLOWED_PROTOCOLS.has(`${schemeMatch[1].toLowerCase()}:`)) {
    return null;
  }

  const candidate = schemeMatch ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;

  // Require a dotted hostname so a typo like "mysite" or an internal name
  // like "localhost" doesn't become a link that goes nowhere for customers.
  const host = url.hostname;
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;

  return url.toString();
}

/**
 * Render-time guard. Returns true only for a parseable http(s) URL.
 * Anything else must not be used as an href.
 */
export function isSafeHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
