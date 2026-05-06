// Single source of truth for resolving recurring-booking discount percentages
// from per-org business_settings. Used by BookingFormContext (admin form) and
// PublicBookingPage (public form) so both surfaces price the same way for the
// same org.
//
// Values are stored as percentages (15 = 15%) in the DB. Pricing math uses
// multipliers (0.15) — the helpers below normalize to a 0-1 multiplier.
//
// Triweekly + Anyday are NOT user-configurable in v1 — they fall through to
// the legacy hardcoded values from pricingData.ts. Only the 4 spec'd
// frequencies (one_time, monthly, biweekly, weekly) read from business_settings.

export interface RecurringDiscountConfig {
  oneTime: number;   // 0-99
  monthly: number;
  biweekly: number;
  weekly: number;
}

// Fallback defaults for the 4 configurable frequencies — match the prior
// admin-form (pricingData.ts) hardcoded values so orgs without a
// business_settings row don't suddenly see different prices.
export const HARDCODED_DEFAULTS: RecurringDiscountConfig = {
  oneTime: 0,
  monthly: 15,
  biweekly: 25,
  weekly: 30,
};

// Triweekly + anyday remain hardcoded for now (not exposed in the UI).
const LEGACY_FREQUENCY_DISCOUNTS: Record<string, number> = {
  triweekly: 20,
  anyday: 15,
};

/**
 * Returns the discount percentage (0-99) for a given frequency id.
 * Accepts the canonical admin-form ids (one_time, weekly, biweekly,
 * triweekly, monthly, anyday) AND the public-form variants
 * (one-time, bi-weekly).
 */
export function getFrequencyDiscountPct(
  frequencyId: string | null | undefined,
  config: RecurringDiscountConfig | null | undefined,
): number {
  if (!frequencyId) return 0;
  const c = config ?? HARDCODED_DEFAULTS;
  const id = frequencyId.toLowerCase().replace(/-/g, '');

  if (id === 'onetime' || id === 'one_time' || frequencyId === 'one-time') {
    return c.oneTime;
  }
  if (id === 'monthly') return c.monthly;
  if (id === 'biweekly') return c.biweekly;
  if (id === 'weekly') return c.weekly;

  // Legacy frequencies (triweekly, anyday) still hardcoded — not exposed in
  // the per-org settings UI yet.
  return LEGACY_FREQUENCY_DISCOUNTS[id] ?? 0;
}

/**
 * Returns the multiplier (0-1) used in pricing math:
 *   price * (1 - getFrequencyDiscountMultiplier(...)) = discounted price
 */
export function getFrequencyDiscountMultiplier(
  frequencyId: string | null | undefined,
  config: RecurringDiscountConfig | null | undefined,
): number {
  return getFrequencyDiscountPct(frequencyId, config) / 100;
}

/**
 * Maps a raw business_settings row to a normalized config. Use this after
 * fetching the row from Supabase — handles missing/null values gracefully.
 */
export function configFromBusinessSettings(
  row:
    | {
        recurring_discount_one_time?: number | null;
        recurring_discount_monthly?: number | null;
        recurring_discount_biweekly?: number | null;
        recurring_discount_weekly?: number | null;
      }
    | null
    | undefined,
): RecurringDiscountConfig {
  if (!row) return HARDCODED_DEFAULTS;
  return {
    oneTime: clampPct(row.recurring_discount_one_time, HARDCODED_DEFAULTS.oneTime),
    monthly: clampPct(row.recurring_discount_monthly, HARDCODED_DEFAULTS.monthly),
    biweekly: clampPct(row.recurring_discount_biweekly, HARDCODED_DEFAULTS.biweekly),
    weekly: clampPct(row.recurring_discount_weekly, HARDCODED_DEFAULTS.weekly),
  };
}

function clampPct(v: number | null | undefined, fallback: number): number {
  if (v == null || Number.isNaN(Number(v))) return fallback;
  const n = Number(v);
  if (n < 0) return 0;
  if (n > 99) return 99;
  return n;
}
