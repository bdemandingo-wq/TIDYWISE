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
  /* 6a colour-codes agenda entries and uses purple as a fourth rail. */
  ai: 'bg-[hsl(var(--pv-ai-soft))] border-l-[hsl(var(--pv-ai))]',
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
      <span className="w-[52px] shrink-0 pt-2 text-[11px] font-bold tabular-nums text-[hsl(var(--pv-ink-3))]">
        {time}
      </span>
      <div
        className={cn(
          /* 6a: radius 8, padding 8/10. */
          'min-w-0 flex-1 rounded-[8px] border-l-[3px] px-2.5 py-2',
          RAILS[tone],
        )}
      >
        <p className="truncate text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">{title}</p>
        <p className="truncate text-[10.5px] font-normal text-[hsl(var(--pv-ink-3))]">{meta}</p>
      </div>
    </div>
  );
}
