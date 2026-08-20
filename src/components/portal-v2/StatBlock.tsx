import { cn } from '@/lib/utils';

/**
 * §2 (2a): three inline stat blocks on the inverse hero — stat.md (24/800)
 * over a caption. §3 rule 1: these are the supporting figures, so they sit two
 * size steps under the screen's one hero number.
 *
 * §5.1: `value` is passed as a string so a failed read can render "—". A money
 * figure must never fall back to 0 — the caller decides, not this component.
 */
export function StatBlock({
  value,
  caption,
  onInverse = true,
  className,
}: {
  value: string;
  caption: string;
  onInverse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <p
        className={cn(
          'text-[24px] font-extrabold leading-none tabular-nums',
          onInverse
            ? 'text-[hsl(var(--pv-on-inverse))]'
            : 'text-[hsl(var(--pv-ink))]',
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-[10.5px] font-medium',
          onInverse
            ? 'text-[hsl(var(--pv-on-inverse-muted))]'
            : 'text-[hsl(var(--pv-ink-3))]',
        )}
      >
        {caption}
      </p>
    </div>
  );
}
