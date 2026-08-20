import { Trophy } from 'lucide-react';
import { ProgressBar } from './ProgressBar';

/**
 * 2b's gold family, and the first place gold renders.
 *
 * The two gold tokens never touch: --pv-gold is the ProgressBar FILL, measured
 * at the 3:1 object bar; --pv-gold-ink is the TEXT, on --pv-gold-soft at 4.5:1.
 * They sit within 1.2:1 of each other in both themes, so gold ink on gold fill
 * would be illegible — see §1.1b.
 *
 * §5.1: the banner is omitted entirely when the client is not enrolled. On a
 * failed read it renders WITHOUT the bar — "a zero-width gold bar reads as lost
 * points".
 */
export function LoyaltyBanner({
  tier,
  points,
  progress,
  nextTierHint,
  error = false,
  onBenefits,
}: {
  tier?: string;
  points?: number;
  progress?: number;
  nextTierHint?: string;
  error?: boolean;
  onBenefits?: () => void;
}) {
  return (
    <section className="rounded-[14px] border border-[hsl(var(--pv-gold-soft))] bg-[hsl(var(--pv-gold-soft))] px-4 py-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 shrink-0 text-[hsl(var(--pv-gold-ink))]" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[hsl(var(--pv-gold-ink))]">
          {error ? 'Points unavailable' : `${tier} · ${points?.toLocaleString()} pts`}
        </p>
        <button
          type="button"
          onClick={onBenefits}
          className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-gold-ink))] underline-offset-2 hover:underline"
        >
          Benefits
        </button>
      </div>

      {!error && typeof progress === 'number' && (
        <div className="mt-2.5">
          <ProgressBar value={progress} tone="gold" label={`${tier} tier progress`} />
        </div>
      )}

      {!error && nextTierHint && (
        <p className="mt-2 text-[11.5px] font-medium text-[hsl(var(--pv-gold-ink))]">
          {nextTierHint}
        </p>
      )}
    </section>
  );
}
