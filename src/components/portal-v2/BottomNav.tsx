import { Home, Calendar, Wallet, FileText, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'calendar', label: 'Calendar', Icon: Calendar },
  { id: 'earnings', label: 'Earnings', Icon: Wallet },
  { id: 'docs', label: 'Docs', Icon: FileText },
  { id: 'profile', label: 'Profile', Icon: User },
] as const;

/** §2 (2a): Home, Calendar, Earnings, Docs, Profile. type.navLabel 10/600, 700 active. */
export function BottomNav({
  active = 'home',
  onSelect,
}: {
  active?: (typeof ITEMS)[number]['id'];
  onSelect?: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Portal navigation"
      className="sticky bottom-0 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex">
        {ITEMS.map(({ id, label, Icon }) => {
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
                  on
                    ? 'text-[hsl(var(--pv-brand))]'
                    : 'text-[hsl(var(--pv-ink-3))]',
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                <span className={cn('text-[10px]', on ? 'font-bold' : 'font-semibold')}>
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
