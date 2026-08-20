import { cn } from '@/lib/utils';

export type TimeChoice = { id: string; label: string; disabled?: boolean };

/**
 * §2: used by 1c and 3b. "Flexible" is not special-cased — it is just another
 * choice, so the caller decides whether to offer it.
 *
 * Not role="tab"/"radio": these are toggle buttons in a group, and
 * `.portal-v2 [role="tab"]` in index.css:1296 would flatten them with
 * `!important` regardless of what we set here.
 */
export function TimeChipRow({
  times,
  value,
  onChange,
  label,
}: {
  times: TimeChoice[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {times.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            disabled={t.disabled}
            aria-pressed={on}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex h-11 items-center rounded-full px-3.5 text-[12.5px] font-bold',
              'transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]',
              on
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : t.disabled
                  ? 'cursor-not-allowed border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-disabled))]'
                  : 'border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))]',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
