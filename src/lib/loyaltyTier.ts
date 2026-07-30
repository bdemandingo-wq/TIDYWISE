// Loyalty tier progression helpers.
//
// Tiers are defined PER ORG in `client_tier_settings`, keyed on lifetime
// SPENDING in dollars (`min_spending` / `max_spending`). 29 orgs have set those
// thresholds deliberately, so spending — not points — is the tier basis.
//
// There are deliberately NO default tiers in this module. A hardcoded
// DEFAULT_TIERS list used to live here, and because `LoyaltyTierBanner` called
// computeTierProgress without passing tiers, every one of the other 86
// businesses' portals displayed TidyWise Cleaning's tier names and thresholds.
// If a caller has no tiers, that is a loading or configuration state for the UI
// to handle — not something this module should paper over with a guess.
//
// The org-wide default fallback (Bronze/Silver/Gold/Platinum) still exists, but
// it lives in ONE place server-side: get_loyalty_tier_info / get_org_tiers.
// Callers receive whatever those return; they never invent tiers locally.

export interface TierDef {
  name: string;
  /** Lifetime spend in dollars at which this tier starts. */
  minSpending: number;
}

export interface TierProgress {
  /**
   * The tier the customer currently holds, or null when their lifetime spend is
   * BELOW the org's lowest threshold.
   *
   * Not every org starts a tier at $0. Thresholds were confirmed non-overlapping
   * (2026-07-29), but nothing guarantees a zero floor — an org whose lowest tier
   * begins at $200 has customers below it who hold no tier at all. Returning the
   * lowest tier here would silently promote them.
   */
  current: TierDef | null;
  /** The next tier up, or null when already at the top. */
  next: TierDef | null;
  /** Dollars still needed to reach `next`. 0 when there is no next tier. */
  amountAway: number;
}

/**
 * Resolve a customer's tier position from their lifetime spend against this
 * org's tiers.
 *
 * @param lifetimeSpend dollars, from customer_loyalty.lifetime_spend (monotonic)
 * @param tiers this org's tiers — required; pass what the server returned
 * @throws if `tiers` is empty, rather than guessing a ladder
 */
export function computeTierProgress(
  lifetimeSpend: number,
  tiers: TierDef[],
): TierProgress {
  if (!tiers || tiers.length === 0) {
    throw new Error(
      'computeTierProgress: no tiers supplied for this organization. ' +
        'Callers must handle the loading/unconfigured state rather than ' +
        'falling back to a default ladder.',
    );
  }

  const sorted = [...tiers].sort((a, b) => a.minSpending - b.minSpending);

  // No zero-floor assumption: `current` stays null until a threshold is met.
  let current: TierDef | null = null;
  for (const t of sorted) {
    if (lifetimeSpend >= t.minSpending) current = t;
  }

  // With no tier yet, the "next" milestone is the lowest tier — so the UI can
  // still say "$150 more to reach Regular".
  const next = current
    ? sorted.find((t) => t.minSpending > current!.minSpending) ?? null
    : sorted[0];

  const amountAway = next ? Math.max(0, next.minSpending - lifetimeSpend) : 0;

  return { current, next, amountAway };
}

/**
 * Progress toward the next tier, 0–100, for a progress bar.
 *
 * Replaces a hardcoded `{ bronze: 25, silver: 50, gold: 75, platinum: 100 }`
 * lookup, which returned 25 for every org that renamed its tiers.
 *
 * - Climbing toward the first tier: fraction of that first threshold.
 * - Between two tiers: fraction of the gap between them.
 * - At the top tier: 100.
 */
export function tierProgressPercent(
  lifetimeSpend: number,
  tiers: TierDef[],
): number {
  const { current, next } = computeTierProgress(lifetimeSpend, tiers);

  if (!next) return 100;

  const floor = current ? current.minSpending : 0;
  const span = next.minSpending - floor;
  if (span <= 0) return 100;

  const pct = ((lifetimeSpend - floor) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/* ───────────────────────── Admin-side threshold validation ───────────────── */

/** A tier's spend range, as stored in client_tier_settings. */
export interface TierRange {
  id: string;
  tier_name: string;
  /** Dollars. */
  min_spending: number;
  /** Dollars, or null for "unlimited" (the top tier). */
  max_spending: number | null;
}

export interface TierValidationResult {
  /** Non-null means do NOT save — the value would corrupt tier resolution. */
  error: string | null;
  /** Non-null means save, but tell the owner something looks unintended. */
  warning: string | null;
}

/**
 * Validate one tier's thresholds against the rest of the org's tiers.
 *
 * Why this has to exist: resolve_customer_tier() picks a tier with
 *   min_spending <= spend AND (max_spending IS NULL OR spend <= max_spending)
 * ordered by tier_order DESC. That is only deterministic while ranges do not
 * overlap. Two overlapping tiers mean a customer's tier depends on tier_order
 * rather than on what they spent, which is impossible for an owner to reason
 * about and silently moves customers between tiers.
 *
 * Gaps are warned about rather than blocked: a gap is almost always a mistake
 * (a customer landing in one resolves to NO tier at all) but an owner may be
 * mid-way through moving a boundary, and blocking would trap them.
 */
export function validateTierThresholds(
  candidate: TierRange,
  allTiers: TierRange[],
): TierValidationResult {
  const { min_spending: min, max_spending: max } = candidate;

  if (!Number.isFinite(min)) {
    return { error: 'Minimum must be a number.', warning: null };
  }
  if (min < 0) {
    return { error: 'Minimum cannot be negative.', warning: null };
  }
  if (max !== null) {
    if (!Number.isFinite(max)) {
      return { error: 'Maximum must be a number, or empty for unlimited.', warning: null };
    }
    if (max < 0) {
      return { error: 'Maximum cannot be negative.', warning: null };
    }
    if (max <= min) {
      return { error: 'Maximum must be greater than the minimum.', warning: null };
    }
  }

  const others = allTiers.filter((t) => t.id !== candidate.id);

  // Only one tier may be unlimited — two open-ended ranges always overlap.
  if (max === null) {
    const otherUnlimited = others.find((t) => t.max_spending === null);
    if (otherUnlimited) {
      return {
        error: `"${otherUnlimited.tier_name}" is already unlimited. Only the top tier can have an empty maximum.`,
        warning: null,
      };
    }
  }

  const hi = max ?? Number.POSITIVE_INFINITY;
  for (const other of others) {
    const otherHi = other.max_spending ?? Number.POSITIVE_INFINITY;
    // Inclusive bounds on both sides, matching the SQL comparison.
    if (min <= otherHi && other.min_spending <= hi) {
      return {
        error:
          `This range overlaps "${other.tier_name}" ` +
          `(${other.min_spending}–${other.max_spending ?? '∞'}). ` +
          `Overlapping tiers make a customer's tier depend on ordering rather than spend.`,
        warning: null,
      };
    }
  }

  // Gap check: is there a hole between this tier and the next one up?
  if (max !== null) {
    const next = others
      .filter((t) => t.min_spending > max)
      .sort((a, b) => a.min_spending - b.min_spending)[0];
    if (next && next.min_spending > max + 1) {
      return {
        error: null,
        warning:
          `Gap between ${max} and ${next.min_spending} ("${next.tier_name}"). ` +
          `A customer in that range will have no tier at all.`,
      };
    }
  }

  return { error: null, warning: null };
}
