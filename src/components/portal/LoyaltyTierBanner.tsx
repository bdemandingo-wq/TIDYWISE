import { Trophy, Sparkles } from 'lucide-react';
import { computeTierProgress } from '@/lib/loyaltyTier';

interface Props {
  lifetimePoints: number;
  tier: string | null | undefined;
}

export function LoyaltyTierBanner({ lifetimePoints, tier }: Props) {
  const { current, next, cleansAway, reachedTierJustNow } = computeTierProgress(lifetimePoints, tier);

  if (reachedTierJustNow) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-sm">Congrats — you're now {current.name}!</p>
          <p className="text-xs text-muted-foreground">Enjoy your new loyalty perks on upcoming cleans.</p>
        </div>
      </div>
    );
  }

  if (next && cleansAway <= 1) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3">
        <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <p className="font-semibold text-sm">You're 1 clean away from {next.name}!</p>
          <p className="text-xs text-muted-foreground">Book your next appointment to unlock it.</p>
        </div>
      </div>
    );
  }

  return null;
}

export default LoyaltyTierBanner;
