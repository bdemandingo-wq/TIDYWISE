import { cn } from '@/lib/utils';

/** §4: ProgressBar primary/gold (1c, 2a, 2b). Track is --pv-sunken. */
export function ProgressBar({
  value,
  tone = 'primary',
  label,
}: {
  value: number;
  /* 5d colours each automation's bar by its own success rate — a failing
     pipeline reads red, a healthy one green. So the bar needs the full
     status set, not just brand and loyalty gold. */
  tone?: 'primary' | 'gold' | 'success' | 'warn' | 'danger';
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--pv-sunken))]"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none',
          tone === 'gold'
            ? 'bg-[hsl(var(--pv-gold))]'
            : tone === 'success'
              ? 'bg-[hsl(var(--pv-success))]'
              : tone === 'warn'
                ? 'bg-[hsl(var(--pv-warn))]'
                : tone === 'danger'
                  ? 'bg-[hsl(var(--pv-danger))]'
                  : 'bg-[hsl(var(--pv-brand))]',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
