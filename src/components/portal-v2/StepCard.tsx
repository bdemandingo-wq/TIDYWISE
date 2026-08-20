import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * §2 + §3 rule 12 (1c): stepped forms collapse, never paginate. A completed
 * step compresses to a one-line summary with Edit; exactly one step is
 * expanded; upcoming steps stay visible in disabled colours.
 *
 *   complete  check square (primaryTint), title, Edit link, one-line summary
 *   active    2px primary border, children rendered
 *   upcoming  collapsed, disabled colours
 *
 * §3 rule 5 again: an upcoming step is dimmed, not hidden — it uses
 * --pv-ink-disabled, which clears 4.5:1, so the user can see what is coming.
 */
export function StepCard({
  index,
  title,
  state,
  summary,
  onEdit,
  children,
}: {
  index: number;
  title: string;
  state: 'complete' | 'active' | 'upcoming';
  summary?: string;
  onEdit?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-[16px] bg-[hsl(var(--pv-surface))] px-[18px] py-3.5',
        state === 'active'
          ? 'border-2 border-[hsl(var(--pv-brand))]'
          : 'border border-[hsl(var(--pv-border))]',
      )}
      aria-current={state === 'active' ? 'step' : undefined}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[11px] font-extrabold tabular-nums',
            state === 'complete'
              ? 'bg-[hsl(var(--pv-brand-soft))] text-[hsl(var(--pv-brand))]'
              : state === 'active'
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-sunken))] text-[hsl(var(--pv-ink-disabled))]',
          )}
        >
          {state === 'complete' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index}
        </span>

        <h2
          className={cn(
            'min-w-0 flex-1 truncate text-[14px] font-extrabold',
            state === 'upcoming'
              ? 'text-[hsl(var(--pv-ink-disabled))]'
              : 'text-[hsl(var(--pv-ink))]',
          )}
        >
          {title}
        </h2>

        {state === 'complete' && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {state === 'complete' && summary && (
        <p className="mt-1.5 truncate pl-[34px] text-[11.5px] font-medium text-[hsl(var(--pv-ink-3))]">
          {summary}
        </p>
      )}

      {state === 'active' && children && <div className="mt-3.5">{children}</div>}
    </section>
  );
}
