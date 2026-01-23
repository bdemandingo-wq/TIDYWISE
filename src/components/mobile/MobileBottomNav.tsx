import { NavLink, useLocation } from 'react-router-dom';
import { Home, Users, Target, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey = 'home' | 'customers' | 'leads' | 'messages' | 'settings';

const tabs: Array<{ key: TabKey; label: string; to: string; Icon: typeof Home }> = [
  { key: 'home', label: 'Home', to: '/dashboard', Icon: Home },
  { key: 'customers', label: 'Customers', to: '/dashboard/customers', Icon: Users },
  { key: 'leads', label: 'Leads', to: '/dashboard/leads', Icon: Target },
  { key: 'messages', label: 'Messages', to: '/dashboard/messages', Icon: MessageSquare },
  { key: 'settings', label: 'Settings', to: '/dashboard/settings', Icon: Settings },
];

function isDashboardRoute(pathname: string) {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
}

export function MobileBottomNav() {
  const location = useLocation();

  if (!isDashboardRoute(location.pathname)) return null;

  return (
    <nav
      className={cn(
        'md:hidden fixed left-0 right-0 z-50',
        'bottom-0 pb-[env(safe-area-inset-bottom)]',
        'bg-background/90 backdrop-blur border-t border-border'
      )}
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {tabs.map(({ key, label, to, Icon }) => (
          <NavLink
            key={key}
            to={to}
            className={({ isActive }) =>
              cn(
                'h-14 flex flex-col items-center justify-center gap-1',
                'text-xs font-medium transition-colors',
                'active:scale-[0.98] will-change-transform',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="leading-none">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
