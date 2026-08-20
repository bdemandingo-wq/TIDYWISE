import { cn } from '@/lib/utils';

/**
 * A pay figure in a primaryTint inset — §3 rule 7, primaryTint means structured
 * data. Used on the job cards in 2a.
 *
 * There is no inverse variant. 3a briefly had one, stacking muted rate lines on
 * the navy hero, but the breakdown was removed: pay is entered by an admin on
 * the booking form rather than derived from a rate and an hour count, so
 * decomposing it implied a calculation that does not exist. 3a now renders the
 * figure directly and nothing puts pay on navy.
 *
 * §5 long content: names never truncate in pay contexts, so the label wraps and
 * the figure keeps its column.
 */
export function PayWell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 rounded-[10px]',
        'bg-[hsl(var(--pv-brand-soft))] px-3 py-2',
        className,
      )}
    >
      <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--pv-brand))]">
        {label}
      </span>
      <span className="text-[15px] font-extrabold tabular-nums text-[hsl(var(--pv-brand))]">
        {value}
      </span>
    </div>
  );
}
