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
  /* 4c uses a gold-accented card for "Owed to you" (gold label, gold-tinted
     surface and border) and a green label for "Completed". `danger` predates
     these and stays for the churn stat. */
  tone?: 'default' | 'danger' | 'gold' | 'success';
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'flex-1',
        /* 4c tints the "Owed to you" card itself, not just its label:
           a gold-washed surface and a gold border. Translated to the gold
           family rather than copying the comp's gradient hexes. */
        tone === 'gold' && 'border-[hsl(var(--pv-gold))] bg-[hsl(var(--pv-gold-soft))]',
        className,
      )}
    >
      <p
        className={cn(
          /* Mockup 4c: 10.5px, weight 600, sentence case — NOT uppercase.
             Zero uppercase/letter-spacing occurrences across 1b and 4c; the
             one in 2a is PayWell's "YOUR PAY", a different element. */
          'text-[10.5px] font-semibold',
          tone === 'gold'
            ? 'text-[hsl(var(--pv-gold))]'
            : tone === 'success'
              ? 'text-[hsl(var(--pv-success))]'
              : 'text-[hsl(var(--pv-ink-3))]',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          /* Mockup 4c/1b: 22px, not 24px. */
          'mt-1 text-[22px] font-extrabold leading-none tabular-nums',
          tone === 'danger'
            ? 'text-[hsl(var(--pv-danger))]'
            : 'text-[hsl(var(--pv-ink))]',
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-medium text-[hsl(var(--pv-ink-3))]">
        {caption}
      </p>
    </Card>
  );
}
