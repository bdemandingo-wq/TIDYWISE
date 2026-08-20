import { cn } from '@/lib/utils';
import { Card } from './Card';

/**
 * §2 (1b): StatPairGrid is two of these — label, stat, caption.
 *
 * §5.1: "the churn stat must never show red 0 on failure". `tone` is separate
 * from `value` precisely so an errored card can pass "—" with the default tone
 * instead of a red zero, which reads as a real and alarming number.
 */
export function StatCard({
  label,
  value,
  caption,
  tone = 'default',
  className,
}: {
  label: string;
  value: string;
  caption: string;
  tone?: 'default' | 'danger';
  className?: string;
}) {
  return (
    <Card className={cn('flex-1', className)}>
      <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 text-[24px] font-extrabold leading-none tabular-nums',
          tone === 'danger'
            ? 'text-[hsl(var(--pv-danger))]'
            : 'text-[hsl(var(--pv-ink))]',
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">
        {caption}
      </p>
    </Card>
  );
}
