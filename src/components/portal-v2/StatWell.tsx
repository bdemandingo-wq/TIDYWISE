import { cn } from '@/lib/utils';

/**
 * §2 (1b): three of these sit in the hero's StatWellRow — inverseWell bg,
 * radius 12. §3 rule 10: depth is inset wells, not shadows; on the navy the
 * inset is a 10% white wash rather than a page-coloured rectangle.
 *
 * §5.1: `value` is a string so a failed read renders "—". Money never falls
 * back to 0 on failure — the caller decides that, not this component.
 */
export function StatWell({
  value,
  caption,
  className,
}: {
  value: string;
  caption: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-[12px] bg-[hsl(var(--pv-inverse-well))] px-2.5 py-2',
        className,
      )}
    >
      <p className="text-[20px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-on-inverse))]">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-medium text-[hsl(var(--pv-on-inverse-muted))]">
        {caption}
      </p>
    </div>
  );
}
