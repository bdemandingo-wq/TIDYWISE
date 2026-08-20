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
  fab?: { label: string; onClick?: () => void };
}) {
  const mid = Math.ceil(items.length / 2);
  const groups = fab ? [items.slice(0, mid), items.slice(mid)] : [items];

  return (
    <nav
      aria-label="Portal navigation"
      className="sticky bottom-0 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] pb-[env(safe-area-inset-bottom)]"
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
            className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))] shadow-[0_6px_14px_hsl(var(--pv-brand)/0.35)] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-surface))]"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
    </nav>
  );
}
