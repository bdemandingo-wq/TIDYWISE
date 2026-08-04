import { extras as defaultExtras } from '@/data/pricingData';

/**
 * Booking add-ons ("extras") — parsing and label resolution.
 *
 * `bookings.extras` stores SLUGS, not labels: ["appliances", "laundry"]. The
 * human label lives in `service_pricing.extras` and is per-organisation, and
 * organisations genuinely remap the same slug to different work. At one org
 * live today, slug `windows` is labelled "Inside Oven" and `appliances` is
 * "Inside Refrigerator".
 *
 * That is why this file exists rather than rendering the raw value. Showing a
 * cleaner "Appliances" when the customer ordered and paid for "Inside
 * Refrigerator" is worse than showing nothing — it is a confidently wrong
 * instruction on a job sheet.
 */

export interface ExtraOption {
  id: string;
  name: string;
}

/**
 * Read the slug list off a booking's `extras` column.
 *
 * Two shapes are reachable. Every one of the 25 rows carrying extras today is
 * a bare array, which is what both admin booking paths write. The public
 * booking form builds `{ names: [...] }` into its submit payload
 * (PublicBookingPage), so the object form has to be tolerated too.
 *
 * Never throws and never returns null — a malformed value yields an empty
 * list, because a job card must render either the add-ons or nothing at all.
 */
export function parseExtras(raw: unknown): string[] {
  const fromArray = (arr: unknown[]): string[] =>
    arr
      .map((v) => {
        if (typeof v === 'string') return v;
        // Defensive: an array of {id,name} objects would also be readable.
        if (v && typeof v === 'object') {
          const o = v as { id?: unknown; name?: unknown };
          if (typeof o.id === 'string') return o.id;
          if (typeof o.name === 'string') return o.name;
        }
        return '';
      })
      .filter((s) => s.trim().length > 0);

  if (Array.isArray(raw)) return fromArray(raw);

  if (raw && typeof raw === 'object') {
    const names = (raw as { names?: unknown }).names;
    if (Array.isArray(names)) return fromArray(names);
  }

  return [];
}

/**
 * Turn a slug into something a cleaner can act on.
 *
 * Order of preference:
 *   1. The organisation's own catalogue — the label the customer actually saw.
 *   2. The default catalogue in pricingData.
 *   3. A prettified slug: `inside_dishwasher` -> "Inside Dishwasher". Live data
 *      contains slugs present in neither catalogue, and a raw underscored slug
 *      on a job card reads like a bug.
 */
export function resolveExtraLabels(
  slugs: string[],
  orgExtras: ExtraOption[] | null | undefined,
): string[] {
  const byId = new Map<string, string>();

  // Default catalogue first, so the org's entries overwrite it.
  for (const e of defaultExtras) {
    if (e?.id && e?.name) byId.set(e.id, e.name);
  }
  for (const e of orgExtras ?? []) {
    if (e?.id && typeof e.name === 'string' && e.name.trim()) {
      byId.set(e.id, e.name.trim());
    }
  }

  return slugs.map((slug) => byId.get(slug) ?? prettifySlug(slug));
}

/** `inside_dishwasher` -> "Inside Dishwasher". Also handles kebab-case. */
function prettifySlug(slug: string): string {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Convenience: column value straight to display labels. */
export function extrasToLabels(
  raw: unknown,
  orgExtras: ExtraOption[] | null | undefined,
): string[] {
  return resolveExtraLabels(parseExtras(raw), orgExtras);
}
