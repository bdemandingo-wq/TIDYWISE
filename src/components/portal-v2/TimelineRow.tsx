import { cn } from '@/lib/utils';

/**
 * §2 (1b): time gutter (52px) + event well with a 3px left rail.
 * §3 rule 13: the gutter is fixed and the numerals tabular, so scan lines align
 * down the list regardless of how long each time string is.
 *
 * The rail carries the service colour. Rather than adding a bespoke service
 * palette, it reuses the measured semantic families — same reasoning as Avatar.
 */
const RAILS = {
  brand: 'bg-[hsl(var(--pv-brand-soft))] border-l-[hsl(var(--pv-brand))]',
  success: 'bg-[hsl(var(--pv-success-soft))] border-l-[hsl(var(--pv-success))]',
  warn: 'bg-[hsl(var(--pv-warn-soft))] border-l-[hsl(var(--pv-warn))]',
} as const;

export function TimelineRow({
  time,
  title,
  meta,
  tone = 'brand',
}: {
  time: string;
  title: string;
  meta: string;
  tone?: keyof typeof RAILS;
}) {
  return (
    <div className="flex items-stretch gap-3">
      <span className="w-[52px] shrink-0 pt-2 text-right text-[11.5px] font-bold tabular-nums text-[hsl(var(--pv-ink-3))]">
        {time}
      </span>
      <div
        className={cn(
          'min-w-0 flex-1 rounded-[10px] border-l-[3px] px-3 py-2',
          RAILS[tone],
        )}
      >
        <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">{title}</p>
        <p className="truncate text-[11.5px] font-normal text-[hsl(var(--pv-ink-2))]">{meta}</p>
      </div>
    </div>
  );
}
