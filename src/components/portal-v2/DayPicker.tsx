import { MoreHorizontal } from 'lucide-react';
import { DateTile, DateTileAction } from './DateTile';

export type PickableDate = {
  id: string;
  weekday: string;
  day: string;
  disabled?: boolean;
};

/**
 * §2: 1c shows 5 tiles; 3b shows 4 plus a "More" tile. Same component — the
 * trailing action is optional rather than a second picker.
 *
 * §5.1 says the empty state here is "not possible — dates are computed
 * client-side", which is true only while they are. If availability ever comes
 * from a request, this needs the empty/error split like every other surface.
 */
export function DayPicker({
  dates,
  value,
  onChange,
  onMore,
  label,
}: {
  dates: PickableDate[];
  value: string | null;
  onChange: (id: string) => void;
  onMore?: () => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-0.5">
      {dates.map((d) => (
        <DateTile
          key={d.id}
          weekday={d.weekday}
          day={d.day}
          selected={d.id === value}
          disabled={d.disabled}
          onClick={() => onChange(d.id)}
        />
      ))}
      {onMore && (
        <DateTileAction
          label="More"
          icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}
          onClick={onMore}
        />
      )}
    </div>
  );
}
