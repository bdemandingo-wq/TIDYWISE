import { cn } from '@/lib/utils';

/**
 * 46px wide, not 52: 1c shows five chips PLUS the calendar tile, and at 390px
 * a 52px tile pushed the calendar off the right edge behind a scroll. The
 * escape hatch has to be visible without swiping or nobody finds it. 46px is
 * still over the 44px tap minimum (§3 rule 14).
 *
 * §4: DateTile is used by 1c, 2b and 3b, and the three want different things
 * from it — so the variants are here rather than retrofitted later.
 *
 *   1c  DayPicker, 5 tiles, one selected      -> interactive
 *   3b  DayPicker, 4 tiles + a "More" tile    -> interactive + action
 *   2b  BookingRow, shows a date, never taps  -> static
 *
 * `static` renders a <div>, not a disabled <button>: a date that was never
 * interactive should not be announced as an unavailable control. Genuinely
 * unavailable dates in a picker use `disabled` on the interactive variant,
 * which keeps them legible per §3 rule 5 rather than hiding them.
 */
export function DateTile({
  weekday,
  day,
  variant = 'interactive',
  selected = false,
  disabled = false,
  onClick,
  className,
}: {
  weekday: string;
  day: string;
  variant?: 'interactive' | 'static';
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const shell = cn(
    'flex h-[58px] w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border',
    selected
      ? 'border-transparent bg-[hsl(var(--pv-brand))]'
      : 'border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))]',
    className,
  );

  const wd = cn(
    'text-[10px] font-bold uppercase tracking-[0.06em]',
    selected
      ? 'text-[hsl(var(--pv-brand-ink))]'
      : disabled
        ? 'text-[hsl(var(--pv-ink-disabled))]'
        : 'text-[hsl(var(--pv-ink-3))]',
  );
  const dd = cn(
    'text-[17px] font-extrabold leading-none tabular-nums',
    selected
      ? 'text-[hsl(var(--pv-brand-ink))]'
      : disabled
        ? 'text-[hsl(var(--pv-ink-disabled))]'
        : 'text-[hsl(var(--pv-ink))]',
  );

  const body = (
    <>
      <span className={wd}>{weekday}</span>
      <span className={dd}>{day}</span>
    </>
  );

  if (variant === 'static') {
    return (
      <div className={shell} aria-hidden={false}>
        <span className="sr-only">{`${weekday} ${day}`}</span>
        <span aria-hidden className="contents">
          {body}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        shell,
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]',
        disabled && 'cursor-not-allowed',
      )}
    >
      {body}
    </button>
  );
}

/**
 * The trailing tile in the picker — it opens the month calendar.
 *
 * It doubles as the display for a date chosen OUTSIDE the chip range: without
 * that, picking 14 October leaves every chip unselected and the row silently
 * claims nothing is chosen. When `selectedOutside` is set the tile shows that
 * date and reads as pressed, so the row always accounts for the current value.
 */
export function DateTileAction({
  label,
  icon,
  expanded,
  selectedOutside,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  expanded?: boolean;
  selectedOutside?: { weekday: string; day: string } | null;
  onClick?: () => void;
}) {
  const on = !!selectedOutside;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-pressed={on || undefined}
      className={cn(
        'flex h-[58px] w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]',
        on
          ? 'border-transparent bg-[hsl(var(--pv-brand))]'
          : 'border-dashed border-[hsl(var(--pv-border-strong))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-brand))] active:bg-[hsl(var(--pv-sunken))]',
      )}
    >
      {on ? (
        <>
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--pv-brand-ink))]">
            {selectedOutside!.weekday}
          </span>
          <span className="text-[17px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-brand-ink))]">
            {selectedOutside!.day}
          </span>
        </>
      ) : (
        <>
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-[0.06em]">{label}</span>
        </>
      )}
    </button>
  );
}
