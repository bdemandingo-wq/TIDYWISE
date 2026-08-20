import { cn } from '@/lib/utils';

/**
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
    'flex h-[58px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border',
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

/** The trailing "More" tile in 3b's picker. Same footprint, different job. */
export function DateTileAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[58px] w-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[hsl(var(--pv-border-strong))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-brand))] transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]"
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-[0.06em]">{label}</span>
    </button>
  );
}
