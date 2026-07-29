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
