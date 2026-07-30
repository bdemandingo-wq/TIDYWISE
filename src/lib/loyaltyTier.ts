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
  /** Lifetime spend in dollars at which this tier starts. Inclusive. */
  minSpending: number;
  /**
   * Upper bound in dollars, INCLUSIVE, or null for an open-ended top tier.
   *
   * This is not optional and must not be dropped when mapping. Omitting it is
   * what made the client disagree with the server: the client tested only
   * `spend >= minSpending`, so a customer above a bounded tier's ceiling — or in
   * a sub-dollar hole such as $4,999.50 on a 2000-4999 / 5000-null ladder — was
   * shown a tier that resolve_customer_tier() returns NULL for. The banner said
   * "You're currently Gold" beside a card showing no tier at all.
   */
  maxSpending: number | null;
  /** Ordering from client_tier_settings.tier_order. Used as the tie-break. */
  tierOrder: number;
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

  // This predicate is a deliberate mirror of resolve_customer_tier()
  // (migration 20260729231023):
  //
  //   WHERE  v_spend >= cts.min_spending
  //     AND (cts.max_spending IS NULL OR v_spend <= cts.max_spending)
  //   ORDER BY cts.tier_order DESC
  //   LIMIT 1
  //
  // The server is the authority; anything the client shows must agree with what
  // it would return, including returning NOTHING. Both bounds are inclusive, and
  // a spend that matches no tier yields null rather than the nearest tier below.
  const matching = tiers.filter(
    (t) =>
      lifetimeSpend >= t.minSpending &&
      (t.maxSpending === null || lifetimeSpend <= t.maxSpending),
  );
  const current =
    matching.length > 0
      ? [...matching].sort((a, b) => b.tierOrder - a.tierOrder)[0]
      : null;

  // The next milestone is the cheapest tier the customer has not reached. This
  // is correct whether they hold a tier, sit in a gap between two, or are below
  // the lowest threshold — in every case it is the smallest minSpending above
  // their current spend.
  const above = tiers
    .filter((t) => t.minSpending > lifetimeSpend)
    .sort((a, b) => a.minSpending - b.minSpending);
  const next = above[0] ?? null;

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
  //
  // Bounds are INCLUSIVE on both sides and lifetime_spend is numeric(12,2), so
  // the smallest step between two tiers is one cent: [0, 499.99] then [500, …]
  // is contiguous, while [0, 499] then [500, …] leaves 499.01-499.99 uncovered.
  //
  // The old tolerance was `> max + 1`, which treated 4999 -> 5000 as contiguous
  // and so never warned about a $0.99 hole. That is not a rounding nicety: a
  // customer at $4,999.50 matches no tier, resolve_customer_tier returns NULL,
  // and they hold nothing despite having spent more than the tier below
  // requires. Off by a cent is invisible to anyone testing round numbers.
  //
  // Note this validator only guards ladders a human EDITS. The built-in default
  // (0-499 / 500-1999 / 2000-4999 / 5000-null, returned by get_org_tiers when an
  // org has no client_tier_settings rows) carries the same three holes and is not
  // reachable from this code path at all — it lives in the function body. See
  // docs/superpowers/prompts/2026-07-30-fix-default-tier-ladder-gaps.md.
  //
  // Compared in integer cents because 4999 + 0.01 is not exactly 4999.01 in
  // IEEE-754, and a float comparison here would reintroduce the same class of
  // bug one decimal place further down.
  if (max !== null) {
    const next = others
      .filter((t) => t.min_spending > max)
      .sort((a, b) => a.min_spending - b.min_spending)[0];
    const cents = (n: number) => Math.round(n * 100);
    if (next && cents(next.min_spending) > cents(max) + 1) {
      const holeFrom = (cents(max) + 1) / 100;
      const holeTo = (cents(next.min_spending) - 1) / 100;
      return {
        error: null,
        warning:
          `Gap between "${candidate.tier_name}" and "${next.tier_name}": ` +
          `spend from ${holeFrom} to ${holeTo} matches no tier. ` +
          `A customer in that range will hold no tier at all. ` +
          `Set this tier's maximum to ${holeTo} to close it.`,
      };
    }
  }

  return { error: null, warning: null };
}

/* ─────────────────── Shared org-tier row shape + normalisation ───────────── */

/**
 * A row from client_tier_settings, as returned by get_loyalty_tier_info /
 * get_org_tiers (both return the same shape, and the same built-in defaults
 * when an org has no rows of its own).
 */
export interface OrgTier {
  tier_name: string;
  tier_order: number;
  /** Lifetime spend in DOLLARS at which this tier starts. Not points. */
  min_spending: number;
  /** Upper bound in dollars, or null for the top tier. */
  max_spending: number | null;
  /** Always an array after normalisation. */
  benefits: string[];
  color: string;
}

/**
 * Normalise raw tier rows from either transport.
 *
 * There are two legitimate transports and they cannot be merged: the admin app
 * is `authenticated` and calls get_org_tiers by RPC, while the client portal has
 * no Supabase Auth session (custom client_portal_users, every request is `anon`)
 * and must go through the client-portal-api proxy. The MAPPING is identical
 * though, so it lives here rather than being written twice.
 *
 * `benefits` arrives as jsonb (already an array) or as a stringified JSON array.
 * A bad value logs and yields [] rather than taking down the calling screen.
 */
export function normalizeOrgTierRows(raw: unknown[] | null | undefined): OrgTier[] {
  return (raw ?? []).map((row) => {
    const t = row as Record<string, unknown>;

    let benefits: string[] = [];
    if (Array.isArray(t.benefits)) {
      benefits = t.benefits as string[];
    } else if (typeof t.benefits === 'string') {
      try {
        const parsed = JSON.parse(t.benefits);
        if (Array.isArray(parsed)) benefits = parsed as string[];
      } catch (err) {
        console.warn(
          `[loyaltyTier] corrupt benefits for tier ${String(t.tier_name ?? '(unnamed)')}`,
          err,
        );
      }
    }

    return {
      tier_name: String(t.tier_name ?? ''),
      tier_order: Number(t.tier_order ?? 0),
      min_spending: Number(t.min_spending ?? 0),
      max_spending:
        t.max_spending === null || t.max_spending === undefined
          ? null
          : Number(t.max_spending),
      benefits,
      color: String(t.color ?? ''),
    };
  });
}

/** Reduce full rows to what the tier-math helpers take. */
export function toTierDefs(tiers: OrgTier[] | undefined): TierDef[] | undefined {
  return tiers?.map((t) => ({
    name: t.tier_name,
    minSpending: t.min_spending,
    maxSpending: t.max_spending,
    tierOrder: t.tier_order,
  }));
}

/**
 * The tier a customer currently holds, or null when their spend is below the
 * org's lowest threshold — or when tiers are not loaded yet.
 *
 * Safe to call with undefined/empty tiers, unlike computeTierProgress, which
 * throws by design so a caller cannot silently fall back to a guessed ladder.
 */
export function resolveTierName(
  lifetimeSpend: number | null | undefined,
  tiers: TierDef[] | undefined,
): string | null {
  if (!tiers || tiers.length === 0) return null;
  if (lifetimeSpend === null || lifetimeSpend === undefined) return null;
  return computeTierProgress(lifetimeSpend, tiers).current?.name ?? null;
}
