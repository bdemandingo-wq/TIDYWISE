import { Trophy, Sparkles } from 'lucide-react';
import { computeTierProgress, type TierDef } from '@/lib/loyaltyTier';

interface Props {
  /**
   * Lifetime spend in dollars, from customer_loyalty.lifetime_spend.
   * Undefined until client-portal-api includes it in the get_user_data payload
   * (Task 3.3a) — the banner stays hidden until then rather than guessing.
   */
  lifetimeSpend: number | null | undefined;
  /** This org's tiers. Undefined while loading or when none are configured. */
  tiers: TierDef[] | undefined;
}

const money = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

export function LoyaltyTierBanner({ lifetimeSpend, tiers }: Props) {
  // Render nothing rather than guess. Three distinct states land here:
  //   - tiers still loading
  //   - this org has no tiers configured
  //   - lifetime spend not yet available in the portal payload
  // None of them justify inventing a tier. The previous version of this file
  // silently substituted TidyWise Cleaning's hardcoded ladder, which is why
  // every other org's portal showed the wrong tier names.
  if (!tiers || tiers.length === 0) return null;
  if (lifetimeSpend === null || lifetimeSpend === undefined) return null;

  const { current, next, amountAway } = computeTierProgress(lifetimeSpend, tiers);

  // Below this org's lowest threshold: no tier held yet. Not every org starts a
  // tier at $0, so show the climb if there is one and otherwise stay quiet.
  if (!current) {
    if (!next) return null;
    return (
      <div
        data-testid="loyalty-tier-banner"
        className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3"
      >
        <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <p className="font-semibold text-sm">
            {money(amountAway)} more to reach {next.name}
          </p>
          <p className="text-xs text-muted-foreground">Your rewards start there.</p>
        </div>
      </div>
    );
  }

  if (!next) {
    return (
      <div
        data-testid="loyalty-tier-banner"
        className="rounded-2xl border border-primary/40 bg-primary/10 p-4 flex items-center gap-3"
      >
        <Sparkles className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-sm">You're {current.name} — our top tier.</p>
          <p className="text-xs text-muted-foreground">
            Thanks for being one of our best customers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="loyalty-tier-banner"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center gap-3"
    >
      <Trophy className="h-5 w-5 text-amber-600 shrink-0" />
      <div>
        <p className="font-semibold text-sm">
          {money(amountAway)} more to reach {next.name}
        </p>
        <p className="text-xs text-muted-foreground">You're currently {current.name}.</p>
      </div>
    </div>
  );
}

export default LoyaltyTierBanner;
