import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * §2 (2a): done = green tick + struck label; todo = empty circle + label +
 * inline hint + chevron. A blocked hint renders in warnChipText.
 * §3 rule 14: >= 44px tall.
 */
export function ChecklistRow({
  label,
  done,
  hint,
  blocked,
  onClick,
}: {
  label: string;
  done: boolean;
  hint?: string;
  blocked?: boolean;
  onClick?: () => void;
}) {
  const Row = done ? 'div' : 'button';

  return (
    <Row
      {...(done ? {} : { type: 'button' as const, onClick })}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-1 text-left',
        !done &&
          'transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          done
            ? 'bg-[hsl(var(--pv-success))]'
            : 'border-[1.5px] border-[hsl(var(--pv-border-strong))]',
        )}
      >
        {done && (
          <Check className="h-3 w-3 text-[hsl(var(--success-foreground))]" strokeWidth={3} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[13px] font-bold',
            done
              ? 'text-[hsl(var(--pv-ink-3))] line-through'
              : 'text-[hsl(var(--pv-ink))]',
          )}
        >
          {label}
        </span>
        {hint && !done && (
          <span
            className={cn(
              'block truncate text-[11.5px] font-medium',
              blocked
                ? 'text-[hsl(var(--pv-warn))]'
                : 'text-[hsl(var(--pv-ink-3))]',
            )}
          >
            {hint}
          </span>
        )}
      </span>

      {!done && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[hsl(var(--pv-ink-4))]"
          aria-hidden
        />
      )}
    </Row>
  );
}
