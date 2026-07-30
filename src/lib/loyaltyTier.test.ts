// No @ts-ignore on the vitest import, unlike wageCalculation.test.ts.
// tsconfig.app.json excludes src/**/*.test.ts, so tsc never typechecks this
// file and the suppression would do nothing — eslint flags it as a dead
// directive (ban-ts-comment). Once vitest is installed it supplies its own
// types and no suppression is needed either.
import { describe, it, expect } from 'vitest';
import {
  computeTierProgress,
  tierProgressPercent,
  validateTierThresholds,
  type TierDef,
  type TierRange,
} from './loyaltyTier';

// NOTE: vitest is not currently installed in this repo (no dependency, no
// config, no npm script) — src/lib/wageCalculation.test.ts has the same
// problem and has never been executed. This file follows that convention so it
// runs as soon as vitest is added. Until then the same assertions were verified
// by direct execution via `npx tsx`; see the Task 3.2 notes in
// docs/superpowers/plans/2026-07-29-loyalty-tiers-only.md.

// Contiguous, so every dollar lands in exactly one tier — the shape an org
// should have. Bounds are inclusive on both sides, matching resolve_customer_tier.
const ORG_TIERS: TierDef[] = [
  { name: 'Starter', minSpending: 0,    maxSpending: 1199, tierOrder: 1 },
  { name: 'Regular', minSpending: 1200, maxSpending: 3999, tierOrder: 2 },
  { name: 'VIP',     minSpending: 4000, maxSpending: null, tierOrder: 3 },
];

// An org whose lowest tier does NOT start at $0.
const NO_ZERO_FLOOR: TierDef[] = [
  { name: 'Regular', minSpending: 200,  maxSpending: 999,  tierOrder: 1 },
  { name: 'VIP',     minSpending: 1000, maxSpending: null, tierOrder: 2 },
];

describe('computeTierProgress', () => {
  it('uses the org tiers it is given, not any built-in defaults', () => {
    const r = computeTierProgress(1500, ORG_TIERS);
    expect(r.current?.name).toBe('Regular');
    expect(r.next?.name).toBe('VIP');
    expect(r.amountAway).toBe(2500);
  });

  it('reports the top tier with no next and nothing away', () => {
    const r = computeTierProgress(9000, ORG_TIERS);
    expect(r.current?.name).toBe('VIP');
    expect(r.next).toBeNull();
    expect(r.amountAway).toBe(0);
  });

  it('never falls back to the Bronze/Silver/Gold/Platinum ladder', () => {
    const r = computeTierProgress(0, ORG_TIERS);
    expect(r.current?.name).toBe('Starter');
    expect(['Bronze', 'Silver', 'Gold', 'Platinum']).not.toContain(r.current?.name);
  });

  it('throws rather than guessing when given no tiers', () => {
    expect(() => computeTierProgress(500, [])).toThrow(/no tiers/i);
  });

  it('returns no current tier when spend is below the lowest threshold', () => {
    const r = computeTierProgress(50, NO_ZERO_FLOOR);
    expect(r.current).toBeNull();
    expect(r.next?.name).toBe('Regular');
    expect(r.amountAway).toBe(150);
  });

  it('does not promote a below-threshold customer to the lowest tier', () => {
    expect(computeTierProgress(199, NO_ZERO_FLOOR).current).toBeNull();
    expect(computeTierProgress(200, NO_ZERO_FLOOR).current?.name).toBe('Regular');
  });

  it('is insensitive to the order tiers arrive in', () => {
    const shuffled: TierDef[] = [
      { name: 'VIP',     minSpending: 4000, maxSpending: null, tierOrder: 3 },
      { name: 'Starter', minSpending: 0,    maxSpending: 1199, tierOrder: 1 },
      { name: 'Regular', minSpending: 1200, maxSpending: 3999, tierOrder: 2 },
    ];
    const r = computeTierProgress(1500, shuffled);
    expect(r.current?.name).toBe('Regular');
    expect(r.next?.name).toBe('VIP');
  });

  // These are the cases the client used to get wrong by ignoring max_spending.
  it('respects an inclusive upper bound, as the resolver does', () => {
    expect(computeTierProgress(3999, ORG_TIERS).current?.name).toBe('Regular');
    expect(computeTierProgress(4000, ORG_TIERS).current?.name).toBe('VIP');
  });

  it('returns no tier above a BOUNDED top tier, matching resolve_customer_tier', () => {
    const bounded: TierDef[] = [
      { name: 'Base', minSpending: 0,    maxSpending: 1999, tierOrder: 1 },
      { name: 'Top',  minSpending: 2000, maxSpending: 4999, tierOrder: 2 },
    ];
    expect(computeTierProgress(4999, bounded).current?.name).toBe('Top');
    // Above the ceiling with nothing open-ended above it: the server returns
    // NULL, so the client must too rather than showing 'Top' forever.
    expect(computeTierProgress(6000, bounded).current).toBeNull();
  });

  it('returns no tier inside a sub-dollar gap between tiers', () => {
    // The default ladder's 4999 / 5000 boundary leaves 4999.01-4999.99 uncovered.
    const ladder: TierDef[] = [
      { name: 'Gold',     minSpending: 2000, maxSpending: 4999, tierOrder: 3 },
      { name: 'Platinum', minSpending: 5000, maxSpending: null, tierOrder: 4 },
    ];
    const r = computeTierProgress(4999.5, ladder);
    expect(r.current).toBeNull();
    expect(r.next?.name).toBe('Platinum');
  });

  it('breaks ties on tier_order, not on threshold, as the resolver does', () => {
    // Overlapping ranges should not exist, but if one is saved the client must
    // pick the same row the server would.
    const overlapping: TierDef[] = [
      { name: 'Lower', minSpending: 0, maxSpending: 5000, tierOrder: 1 },
      { name: 'Upper', minSpending: 0, maxSpending: 5000, tierOrder: 9 },
    ];
    expect(computeTierProgress(100, overlapping).current?.name).toBe('Upper');
  });

  it('lands exactly on a threshold as the higher tier', () => {
    expect(computeTierProgress(1200, ORG_TIERS).current?.name).toBe('Regular');
    expect(computeTierProgress(4000, ORG_TIERS).current?.name).toBe('VIP');
  });
});

describe('tierProgressPercent', () => {
  const P: TierDef[] = [
    { name: 'A', minSpending: 0,    maxSpending: 999,  tierOrder: 1 },
    { name: 'B', minSpending: 1000, maxSpending: 2999, tierOrder: 2 },
    { name: 'C', minSpending: 3000, maxSpending: null, tierOrder: 3 },
  ];
  const NO_FLOOR: TierDef[] = [
    { name: 'R', minSpending: 200,  maxSpending: 999,  tierOrder: 1 },
    { name: 'V', minSpending: 1000, maxSpending: null, tierOrder: 2 },
  ];

  it('is 0 at a tier floor and 50 halfway to the next', () => {
    expect(tierProgressPercent(0, P)).toBe(0);
    expect(tierProgressPercent(500, P)).toBe(50);
    expect(tierProgressPercent(1000, P)).toBe(0);
    expect(tierProgressPercent(2000, P)).toBe(50);
  });

  it('is 100 at and above the top tier', () => {
    expect(tierProgressPercent(3000, P)).toBe(100);
    expect(tierProgressPercent(9999, P)).toBe(100);
  });

  it('measures against the first threshold when no tier is held yet', () => {
    expect(tierProgressPercent(100, NO_FLOOR)).toBe(50);
    expect(tierProgressPercent(200, NO_FLOOR)).toBe(0);
  });
});

describe('validateTierThresholds', () => {
  const T = (id: string, name: string, min: number, max: number | null): TierRange =>
    ({ id, tier_name: name, min_spending: min, max_spending: max });

  // Contiguous to the cent. The built-in default ladder uses 499 / 1999 / 4999,
  // which leaves a $0.99 hole above each — the very thing this validator now
  // warns about, so the fixture must not reproduce it.
  const LADDER: TierRange[] = [
    T('1', 'Bronze', 0, 499.99),
    T('2', 'Silver', 500, 1999.99),
    T('3', 'Gold', 2000, 4999.99),
    T('4', 'Platinum', 5000, null),
  ];

  const ok = (r: ReturnType<typeof validateTierThresholds>) => !r.error && !r.warning;

  it('accepts an unchanged tier', () => {
    expect(ok(validateTierThresholds(T('2', 'Silver', 500, 1999.99), LADDER))).toBe(true);
  });

  it('rejects non-numeric and negative bounds', () => {
    expect(validateTierThresholds(T('2', 'Silver', NaN, 1999), LADDER).error).toBeTruthy();
    expect(validateTierThresholds(T('2', 'Silver', -1, 1999), LADDER).error).toBeTruthy();
  });

  it('requires max above min', () => {
    expect(validateTierThresholds(T('2', 'Silver', 500, 500), LADDER).error).toBeTruthy();
    expect(validateTierThresholds(T('2', 'Silver', 900, 800), LADDER).error).toBeTruthy();
  });

  it('rejects overlap in either direction, naming the conflicting tier', () => {
    expect(validateTierThresholds(T('2', 'Silver', 500, 2500), LADDER).error).toMatch(/Gold/);
    expect(validateTierThresholds(T('2', 'Silver', 400, 1999.99), LADDER).error).toMatch(/Bronze/);
  });

  it('allows exactly one unlimited tier', () => {
    expect(ok(validateTierThresholds(T('4', 'Platinum', 5000, null), LADDER))).toBe(true);
    expect(validateTierThresholds(T('2', 'Silver', 500, null), LADDER).error).toMatch(/Platinum/);
  });

  it('treats a one-cent step as contiguous, not a gap', () => {
    // [0, 499.99] then [500, ...] covers every value of numeric(12,2).
    const contiguous = [T('1', 'Base', 0, 499.99), T('2', 'Top', 500, null)];
    const r = validateTierThresholds(T('1', 'Base', 0, 499.99), contiguous);
    expect(r.error).toBeNull();
    expect(r.warning).toBeNull();
  });

  it('warns about a SUB-DOLLAR hole that the old +1 tolerance missed', () => {
    // 4999 -> 5000 leaves 4999.01-4999.99 uncovered. The previous check used
    // `next.min > max + 1`, so 5000 > 5000 was false and it never warned.
    const holey = [T('3', 'Gold', 2000, 4999), T('4', 'Platinum', 5000, null)];
    const r = validateTierThresholds(T('3', 'Gold', 2000, 4999), holey);
    expect(r.error).toBeNull();
    expect(r.warning).toMatch(/matches no tier/i);
  });

  it('warns about a gap but does not block it', () => {
    const r = validateTierThresholds(T('2', 'Silver', 500, 1500), LADDER);
    expect(r.error).toBeNull();
    expect(r.warning).toMatch(/Gap/i);
  });

  it('accepts a ladder whose lowest tier does not start at zero', () => {
    const noFloor = [T('1', 'Entry', 200, 999.99), T('2', 'Top', 1000, null)];
    expect(ok(validateTierThresholds(T('1', 'Entry', 200, 999.99), noFloor))).toBe(true);
  });
});
