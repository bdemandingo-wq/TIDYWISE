import { cn } from '@/lib/utils';

/**
 * A rate line inside the pay hero. Right-aligned and muted so the headline
 * figure keeps the weight. §5 long content: names never truncate in pay
 * contexts, so the label wraps and the figure holds its column.
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
