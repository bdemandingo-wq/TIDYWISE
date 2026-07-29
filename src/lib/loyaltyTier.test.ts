// @ts-ignore - vitest types available at test runtime
import { describe, it, expect } from 'vitest';
import { computeTierProgress, type TierDef } from './loyaltyTier';

// NOTE: vitest is not currently installed in this repo (no dependency, no
// config, no npm script) — src/lib/wageCalculation.test.ts has the same
// problem and has never been executed. This file follows that convention so it
// runs as soon as vitest is added. Until then the same assertions were verified
// by direct execution via `npx tsx`; see the Task 3.2 notes in
// docs/superpowers/plans/2026-07-29-loyalty-tiers-only.md.

const ORG_TIERS: TierDef[] = [
  { name: 'Starter', minSpending: 0 },
  { name: 'Regular', minSpending: 1200 },
  { name: 'VIP', minSpending: 4000 },
];

// An org whose lowest tier does NOT start at $0.
const NO_ZERO_FLOOR: TierDef[] = [
  { name: 'Regular', minSpending: 200 },
  { name: 'VIP', minSpending: 1000 },
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
      { name: 'VIP', minSpending: 4000 },
      { name: 'Starter', minSpending: 0 },
      { name: 'Regular', minSpending: 1200 },
    ];
    const r = computeTierProgress(1500, shuffled);
    expect(r.current?.name).toBe('Regular');
    expect(r.next?.name).toBe('VIP');
  });

  it('lands exactly on a threshold as the higher tier', () => {
    expect(computeTierProgress(1200, ORG_TIERS).current?.name).toBe('Regular');
    expect(computeTierProgress(4000, ORG_TIERS).current?.name).toBe('VIP');
  });
});
