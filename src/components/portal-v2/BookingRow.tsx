import { ListRow } from './ListRow';

/**
 * §4: the dense sibling of JobCard, used by 2b's UpcomingList.
 *
 * A thin binding over ListRow — a booking row IS a date-led list row with an
 * action. Keeping it as its own component preserves the name §4 uses without
 * duplicating the slot logic.
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
      <ListRow lead={{ kind: 'date', weekday, day }} title={title} meta={meta} className="flex-1" />
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
