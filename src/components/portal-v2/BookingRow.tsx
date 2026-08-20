import { DateTile } from './DateTile';

/**
 * §4: the dense sibling of JobCard. 2b's UpcomingList uses it; the DateTile is
 * static because the row shows when a booking is, it does not pick a date.
 * §3 rule 13: the tile is the fixed time gutter, so titles align down the list.
 */
export function BookingRow({
  weekday,
  day,
  title,
  meta,
  action,
}: {
  weekday: string;
  day: string;
  title: string;
  meta: string;
  action?: { label: string; onClick?: () => void };
}) {
  return (
    <div className="flex items-center gap-3">
      <DateTile weekday={weekday} day={day} variant="static" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">{title}</p>
        <p className="truncate text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">{meta}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
