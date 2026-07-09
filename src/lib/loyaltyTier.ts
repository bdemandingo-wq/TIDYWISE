// Loyalty tier progression helpers.
// Matches the DB `award_loyalty_points` trigger thresholds (lifetime points).

export interface TierDef {
  name: string;
  minLifetimePoints: number;
}

// Default tiers mirror the DB trigger. Points ~ dollars spent.
export const DEFAULT_TIERS: TierDef[] = [
  { name: 'Bronze', minLifetimePoints: 0 },
  { name: 'Silver', minLifetimePoints: 500 },
  { name: 'Gold', minLifetimePoints: 2000 },
  { name: 'Platinum', minLifetimePoints: 5000 },
];

// Rough "1 clean" translation for the "you're 1 clean away" copy.
const AVG_CLEAN_POINTS = 150;

export interface TierProgress {
  current: TierDef;
  next: TierDef | null;
  pointsAway: number;
  cleansAway: number;
  reachedTierJustNow: boolean;
}

export function computeTierProgress(
  lifetimePoints: number,
  storedTier: string | null | undefined,
  tiers: TierDef[] = DEFAULT_TIERS,
): TierProgress {
  const sorted = [...tiers].sort((a, b) => a.minLifetimePoints - b.minLifetimePoints);
  let current = sorted[0];
  for (const t of sorted) if (lifetimePoints >= t.minLifetimePoints) current = t;
  const next = sorted.find(t => t.minLifetimePoints > current.minLifetimePoints) ?? null;
  const pointsAway = next ? Math.max(0, next.minLifetimePoints - lifetimePoints) : 0;
  const cleansAway = next ? Math.max(1, Math.ceil(pointsAway / AVG_CLEAN_POINTS)) : 0;
  const reachedTierJustNow =
    !!storedTier &&
    storedTier.toLowerCase() === current.name.toLowerCase() &&
    // heuristic: user just crossed threshold within the last "clean"
    lifetimePoints - current.minLifetimePoints < AVG_CLEAN_POINTS &&
    current.minLifetimePoints > 0;
  return { current, next, pointsAway, cleansAway, reachedTierJustNow };
}
