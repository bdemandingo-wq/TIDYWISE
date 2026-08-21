import { cn } from '@/lib/utils';

/**
 * §3 rule 11: sticky footers are transaction summaries — eyebrow + figure left,
 * primary action right, visible throughout a commit flow (1c, 3b).
 * §1.4: separates with a top border, never a shadow.
 */
export function StickyFooterBar({
  eyebrow,
  value,
  children,
  className,
}: {
  eyebrow: string;
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      {/* Reserves the flow space the fixed bar covers. 70px is the bar's
          measured height (11.25 top + content + 12 bottom + the hairline
          border), plus whatever the device's inset adds. Same approach as
          BottomNav — the spacer lives with the component so it cannot drift
          from the bar's own height. */}
      <div
        aria-hidden
        className="h-[calc(70px+env(safe-area-inset-bottom,0px))] shrink-0"
      />
      <div
        className={cn(
          /* FIXED, not sticky — the same change BottomNav needed.
     
             `sticky bottom-0` only pins while its containing block still has
             stickable range, and that is a property of the CONSUMER's layout,
             not of this component. Both current callers happen to guarantee it
             (each wraps the bar in a min-h-dvh flex column, so the document
             always fills the viewport) and I could not make either fall below
             the fold at any viewport height. Unlike BottomNav, this is
             therefore prophylactic rather than a fix for an observed break.
     
             It is still worth making: a transaction summary whose docstring
             promises it stays "visible throughout a commit flow" should not
             depend on the next caller happening to build the right wrapper.
             BottomNav's callers did not, and it took three screens off-screen
             before anyone noticed.
     
             Geometry matches BottomNav exactly: bottom-0 rather than the
             pill's +10px offset, because a full-bleed bar with a top border
             would show a strip of page underneath; the safe-area inset stays
             as bottom PADDING so the background reaches the screen edge while
             the total and the buttons clear the home indicator; and
             left-1/2 + translate + max-w-[430px] because `fixed` positions
             against the viewport, not the 430px column these screens are. */
          'fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2',
          'flex items-center gap-3 border-t border-[hsl(var(--pv-border))]',
          'bg-[hsl(var(--pv-surface))] px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]',
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
            {eyebrow}
          </p>
          <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">{value}</p>
        </div>
        {children}
      </div>
    </>
  );
}
