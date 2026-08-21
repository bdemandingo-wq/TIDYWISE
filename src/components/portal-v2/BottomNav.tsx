import { Home, Calendar, Wallet, FileText, User, CalendarDays, Bell, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NavItem = { id: string; label: string; Icon: React.ComponentType<{ className?: string }> };

/** 2a — cleaner. §2. */
export const CLEANER_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'earnings', label: 'Earnings', Icon: Wallet },
  { id: 'docs', label: 'Docs', Icon: FileText },
  { id: 'profile', label: 'Profile', Icon: User },
];

/** 2b — client. Four items; the FAB sits between the middle pair. §2. */
export const CLIENT_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'bookings', label: 'Bookings', Icon: CalendarDays },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'profile', label: 'Profile', Icon: User },
];

/**
 * §2: 2a is five plain items, 2b is four with a centre FAB. Same bar.
 * §1.4: shadow.fab is the only shadow in the system — everything else is flat.
 */
export function BottomNav({
  items = CLEANER_NAV,
  active = 'home',
  onSelect,
  fab,
}: {
  items?: NavItem[];
  active?: string;
  onSelect?: (id: string) => void;
  /** §2: 2b's FAB is primary; 1b's is navy. §1.4 gives the navy one a black
   *  25% shadow rather than the primary's blue glow. */
  fab?: { label: string; onClick?: () => void; tone?: 'primary' | 'inverse' };
}) {
  const mid = Math.ceil(items.length / 2);
  const groups = fab ? [items.slice(0, mid), items.slice(mid)] : [items];

  return (
    <>
      {/* Reserves the flow space the fixed bar covers, so no caller has to add
          bottom padding and nothing renders underneath it. Same job as
          .portal-v2-scroll does for the floating pill nav, but scoped to this
          component so it cannot get out of step with the bar's own height. */}
      <div
        aria-hidden
        className="h-[calc(57px+env(safe-area-inset-bottom,0px))] shrink-0"
      />
      <nav
        aria-label="Portal navigation"
        /* FIXED, not sticky.
   
           `sticky bottom-0` only pins while its containing block still has
           stickable range. When content barely exceeds the viewport the nav is
           the last thing in a container that ends where the nav ends, so there
           is nothing to stick against and it sits below the fold. Measured at a
           999px viewport before this change: client-home pinned (doc 1032), but
           dashboard-polish put the nav at 1117 and client-bookings at 1101 —
           both off-screen until you scroll to the absolute bottom. On a phone
           that is the primary navigation being invisible.
   
           Left/translate rather than inset-x-0: fixed positions against the
           VIEWPORT, and these screens are a 430px column centred in it. Without
           this the bar would span a desktop window while its content sits in
           the middle. Copied from .portal-v2-nav, which solved the same problem.
   
           bottom-0, NOT the pill's `bottom: calc(env(...) + 10px)`. That offset
           is what makes the pill float; on a full-bleed bar with a top border it
           would leave a 10px strip of page showing underneath, which reads as a
           rendering fault. The safe-area inset is honoured as bottom PADDING
           instead, so the bar's background reaches the screen edge while its
           buttons stay above the home indicator. */
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="relative flex">
        {groups.map((group, gi) => (
          <ul key={gi} className="flex flex-1">
            {group.map(({ id, label, Icon }) => {
              const on = id === active;
              return (
                <li key={id} className="flex-1">
                  <button
                    type="button"
                    aria-current={on ? 'page' : undefined}
                    onClick={() => onSelect?.(id)}
                    className={cn(
                      'flex h-[56px] w-full flex-col items-center justify-center gap-1',
                      'transition-colors duration-150 ease-out',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--pv-brand))]',
                      on ? 'text-[hsl(var(--pv-brand))]' : 'text-[hsl(var(--pv-ink-3))]',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span className={cn('text-[10px]', on ? 'font-bold' : 'font-semibold')}>
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
            {fab && gi === 0 && <li className="w-[64px] shrink-0" aria-hidden />}
          </ul>
        ))}

        {fab && (
          <button
            type="button"
            onClick={fab.onClick}
            aria-label={fab.label}
            className={cn(
              'absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full',
              'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-surface))]',
              fab.tone === 'inverse'
                ? 'bg-[hsl(var(--pv-inverse))] text-[hsl(var(--pv-on-inverse))] shadow-[0_6px_14px_rgba(0,0,0,0.25)] focus-visible:ring-[hsl(var(--pv-inverse))]'
                : 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))] shadow-[0_6px_14px_hsl(var(--pv-brand)/0.35)] focus-visible:ring-[hsl(var(--pv-brand))]',
            )}
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        )}
        </div>
      </nav>
    </>
  );
}
