import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A real month grid, so a client can book further out than the next few days.
 * The chip row stays the shortcut; this is the escape hatch.
 *
 * ALL DATE MATH HERE IS PURE INTEGER ARITHMETIC ON "YYYY-MM-DD" STRINGS.
 * No Date calendar getters, so eslint-rules/no-device-local-dates does not
 * apply and cannot: there is no ambient clock involved. `today` is passed in
 * by the caller, which is also what makes the preview deterministic.
 *
 * Navigable back and forward with NO UPPER BOUND. Going back is allowed —
 * you may need to look at last month to get your bearings — but days before
 * `today` are disabled rather than hidden, per §3 rule 5.
 */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};
const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y: number, m: number) =>
  m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

/** Zeller's congruence. Returns 0 = Sunday. Deterministic, no Date. */
const dayOfWeek = (y: number, m: number, d: number) => {
  let Y = y;
  let M = m;
  if (M < 3) {
    M += 12;
    Y -= 1;
  }
  const K = Y % 100;
  const J = Math.floor(Y / 100);
  const h = (d + Math.floor((13 * (M + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) + 5 * J) % 7;
  return (h + 6) % 7;
};

const step = (y: number, m: number, delta: number) => {
  const t = y * 12 + (m - 1) + delta;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};

export function CalendarMonth({
  value,
  today,
  onChange,
  label,
}: {
  /** Selected date as YYYY-MM-DD, or null. */
  value: string | null;
  /** Today as YYYY-MM-DD. Passed in, never read from the device clock. */
  today: string;
  onChange: (iso: string) => void;
  label: string;
}) {
  const start = parse(value ?? today);
  const [view, setView] = useState({ y: start.y, m: start.m });

  const first = dayOfWeek(view.y, view.m, 1);
  const count = daysInMonth(view.y, view.m);
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: count }, (_, i) => i + 1),
  ];

  return (
    <div
      className="mt-3 rounded-[12px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-1.5"
      aria-label={label}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setView(step(view.y, view.m, -1))}
          aria-label="Previous month"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[hsl(var(--pv-ink))] transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p
          aria-live="polite"
          className="min-w-0 flex-1 text-center text-[13px] font-extrabold text-[hsl(var(--pv-ink))]"
        >
          {MONTHS[view.m - 1]} {view.y}
        </p>
        <button
          type="button"
          onClick={() => setView(step(view.y, view.m, 1))}
          aria-label="Next month"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[hsl(var(--pv-ink))] transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div aria-hidden className="mt-1 grid grid-cols-7">
        {DOW.map((d, i) => (
          <span
            key={i}
            className="py-1 text-center text-[10px] font-bold uppercase tracking-[0.04em] text-[hsl(var(--pv-ink-3))]"
          >
            {d}
          </span>
        ))}
      </div>

      {/* role="grid" rather than a listbox or radiogroup: index.css:1296 styles
          [role="tab"] with !important, and [role="dialog"] is styled too — grid
          is unclaimed, and it is the correct semantic for a month anyway. */}
      <div role="grid" className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} role="gridcell" />;
          const iso = isoOf(view.y, view.m, d);
          const past = iso < today;
          const on = iso === value;
          return (
            <span key={iso} role="gridcell" className="p-[1px]">
              <button
                type="button"
                disabled={past}
                aria-pressed={on}
                aria-label={`${MONTHS[view.m - 1]} ${d}, ${view.y}`}
                onClick={() => onChange(iso)}
                className={cn(
                  'flex h-11 w-full items-center justify-center rounded-[8px] text-[13px] font-bold tabular-nums',
                  'transition-colors duration-150 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]',
                  on
                    ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                    : past
                      ? 'cursor-not-allowed text-[hsl(var(--pv-ink-disabled))]'
                      : 'text-[hsl(var(--pv-ink))] active:bg-[hsl(var(--pv-sunken))]',
                )}
              >
                {d}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** "2026-08-21" -> { weekday: 'Fri', day: '21' }. Pure, no Date. */
export function isoParts(iso: string) {
  const { y, m, d } = parse(iso);
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek(y, m, d)],
    day: pad(d),
    month: MONTHS[m - 1],
    label: `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek(y, m, d)]} ${MONTHS[m - 1].slice(0, 3)} ${d}`,
  };
}
