import { cn } from '@/lib/utils';

/**
 * §4 lists PayWell as shared between 2a and 3a, but the two contexts render it
 * differently: 3a stacks muted rate lines on the inverse hero, 2a puts a single
 * label+amount in a primaryTint inset on a white card. Same component, two
 * variants — §3 rule 7, primaryTint means structured data in both.
 *
 * §5 long content: names never truncate in pay contexts, so the label wraps and
 * the figure keeps its column.
 */
export function PayWell({
  label,
  value,
  variant = 'inverse',
  className,
}: {
  label: string;
  value: string;
  variant?: 'inverse' | 'inset';
  className?: string;
}) {
  if (variant === 'inset') {
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

  return (
    <div className={cn('flex items-baseline justify-between gap-3', className)}>
      <span className="text-[11.5px] font-medium text-[hsl(var(--pv-on-inverse-muted))]">
        {label}
      </span>
      <span className="text-[11.5px] font-semibold tabular-nums text-[hsl(var(--pv-on-inverse-muted))]">
        {value}
      </span>
    </div>
  );
}
