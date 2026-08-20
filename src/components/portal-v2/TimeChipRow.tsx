import { cn } from '@/lib/utils';

export type TimeChoice = { id: string; label: string; disabled?: boolean };

/** The reserved id for the custom-time chip. */
export const OTHER_TIME = '__other';

/** "14:30" -> "2:30 PM". Pure string math — no Date, no locale, no clock. */
export function formatTime24(t: string) {
  const [hRaw, m] = t.split(':');
  const h = Number(hRaw);
  if (Number.isNaN(h)) return t;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/**
 * §2: used by 1c and 3b. "Flexible" is not special-cased — it is just another
 * choice.
 *
 * The chips cover the common slots; "Other" is the escape hatch, the same
 * shape as the calendar behind the date chips. Four fixed chips could not
 * express 7:15am, and a client who needs it has no way to say so.
 *
 * Not role="tab"/"radio": index.css:1296 flattens [role="tab"] with
 * !important, and these are toggle buttons in a group either way.
 */
export function TimeChipRow({
  times,
  value,
  onChange,
  label,
  allowOther = false,
  otherTime = '',
  onOtherTime,
}: {
  times: TimeChoice[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
  allowOther?: boolean;
  /** 24h "HH:MM", the native input's own format. */
  otherTime?: string;
  onOtherTime?: (t: string) => void;
}) {
  const all = allowOther
    ? [...times, { id: OTHER_TIME, label: otherTime ? formatTime24(otherTime) : 'Other' }]
    : times;

  return (
    <div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {all.map((t) => {
          const on = t.id === value;
          const isOther = t.id === OTHER_TIME;
          return (
            <button
              key={t.id}
              type="button"
              disabled={t.disabled}
              aria-pressed={on}
              aria-expanded={isOther ? on : undefined}
              onClick={() => onChange(t.id)}
              className={cn(
                'flex h-11 items-center rounded-full px-3.5 text-[12.5px] font-bold',
                'transition-colors duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]',
                on
                  ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                  : t.disabled
                    ? 'cursor-not-allowed border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-disabled))]'
                    : isOther
                      ? 'border border-dashed border-[hsl(var(--pv-border-strong))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-brand))]'
                      : 'border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))]',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {allowOther && value === OTHER_TIME && (
        <label className="mt-2.5 flex items-center gap-2.5 rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3 py-2">
          <span className="text-[11.5px] font-bold text-[hsl(var(--pv-ink-2))]">Time</span>
          <input
            type="time"
            value={otherTime}
            onChange={(e) => onOtherTime?.(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-[8px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-2.5 text-[13px] font-bold tabular-nums text-[hsl(var(--pv-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
          />
        </label>
      )}
    </div>
  );
}
