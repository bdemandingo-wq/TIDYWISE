import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DateTile, DateTileAction } from './DateTile';
import { CalendarMonth, isoParts } from './CalendarMonth';

export type PickableDate = {
  /** YYYY-MM-DD. The single identity for a date across chips and calendar. */
  iso: string;
  disabled?: boolean;
};

/**
 * §2: 1c shows 5 chips, 3b shows 4 plus the calendar tile. Same component.
 *
 * The chips are a shortcut for the next few days. They are NOT the whole
 * range — a client booking six weeks out could not do it from four chips, so
 * the trailing tile opens a real month grid, navigable with no upper bound.
 *
 * The calendar opens INLINE rather than in a dialog: at 390px a sheet anchored
 * to the top of the viewport puts the month controls out of thumb reach, and
 * [role="dialog"] is styled in index.css besides.
 *
 * §5.1 says the empty state here is "not possible — dates are computed
 * client-side", which stays true: the chips and the grid are both derived.
 * If availability ever comes from a request, this needs the empty/error split.
 */
export function DayPicker({
  dates,
  value,
  onChange,
  today,
  label,
  showCalendar = true,
}: {
  dates: PickableDate[];
  value: string | null;
  onChange: (iso: string) => void;
  /** Today as YYYY-MM-DD, passed in — never read from the device clock. */
  today: string;
  label: string;
  showCalendar?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inChips = dates.some((d) => d.iso === value);
  const outside = value && !inChips ? isoParts(value) : null;

  return (
    <div>
      <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-0.5">
        {dates.map((d) => {
          const p = isoParts(d.iso);
          return (
            <DateTile
              key={d.iso}
              weekday={p.weekday}
              day={p.day}
              selected={d.iso === value}
              disabled={d.disabled}
              onClick={() => onChange(d.iso)}
            />
          );
        })}
        {showCalendar && (
          <DateTileAction
            label={open ? 'Close' : 'More'}
            icon={<CalendarDays className="h-4 w-4" aria-hidden />}
            expanded={open}
            selectedOutside={outside}
            onClick={() => setOpen((o) => !o)}
          />
        )}
      </div>

      {showCalendar && open && (
        <CalendarMonth
          value={value}
          today={today}
          label="Choose a date"
          onChange={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
