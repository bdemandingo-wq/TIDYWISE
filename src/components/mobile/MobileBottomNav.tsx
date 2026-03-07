import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  Target,
  MessageSquare,
  Settings,
  MoreHorizontal,
  Calendar,
  BarChart3,
  ClipboardList,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { usePlatform } from '@/hooks/usePlatform';

type MobileNavItem = {
  id: string;
  label: string;
  to: string;
  iconKey: string;
};

const DEFAULT_TABS: MobileNavItem[] = [
  { id: 'home', label: 'Home', to: '/dashboard', iconKey: 'Home' },
  { id: 'customers', label: 'Customers', to: '/dashboard/customers', iconKey: 'Users' },
  { id: 'leads', label: 'Leads', to: '/dashboard/leads', iconKey: 'Target' },
  { id: 'messages', label: 'Messages', to: '/dashboard/messages', iconKey: 'MessageSquare' },
  { id: 'settings', label: 'Settings', to: '/dashboard/settings', iconKey: 'Settings' },
];

const ICONS: Record<string, typeof Home> = {
  Home,
  Users,
  Target,
  MessageSquare,
  Settings,
  Calendar,
  BarChart3,
  ClipboardList,
  Bell,
  MoreHorizontal,
};

function isDashboardRoute(pathname: string) {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
}

export function MobileBottomNav() {
  const location = useLocation();
  const { organizationId } = useOrgId();
  const { isAdmin } = useOrganization();
  const [tabs, setTabs] = useState<MobileNavItem[]>(DEFAULT_TABS);
  const [moreOpen, setMoreOpen] = useState(false);
  const { isNative } = usePlatform();

  const isDashboard = isDashboardRoute(location.pathname);

  const roleKey = isAdmin ? 'admin' : 'member';

  // Haptic feedback for native tab presses
  const triggerHaptic = useCallback(async () => {
    if (!isNative) return;
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Haptics not available
    }
  }, [isNative]);

  useEffect(() => {
    if (!isDashboard) return;
    let cancelled = false;
    const load = async () => {
      if (!organizationId) return;
      try {
        const { data, error } = await supabase
          .from('organization_mobile_nav_settings')
          .select('items')
          .eq('organization_id', organizationId)
          .eq('role', roleKey)
          .maybeSingle();

        if (error) throw error;
        const items = Array.isArray((data as any)?.items) ? ((data as any).items as any[]) : [];
        const sanitized: MobileNavItem[] = items
          .map((raw) => {
            const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
            const to = typeof raw?.to === 'string' ? raw.to.trim() : '';
            const iconKey = typeof raw?.iconKey === 'string' ? raw.iconKey : 'Home';
            const id = typeof raw?.id === 'string' ? raw.id : `${label}_${to}`;
            if (!label || !to || !to.startsWith('/dashboard')) return null;
            return { id, label, to, iconKey };
          })
          .filter(Boolean) as MobileNavItem[];

        if (!cancelled) {
          setTabs(sanitized.length ? sanitized : DEFAULT_TABS);
        }
      } catch (e) {
        if (!cancelled) setTabs(DEFAULT_TABS);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, roleKey, isDashboard]);

  const { primaryTabs, overflowTabs, overflowActive } = useMemo(() => {
    if (tabs.length <= 5) {
      return { primaryTabs: tabs, overflowTabs: [] as MobileNavItem[], overflowActive: false };
    }
    const primary = tabs.slice(0, 4);
    const overflow = tabs.slice(4);
    const isOverflowActive = overflow.some((t) => location.pathname === t.to);
    return { primaryTabs: primary, overflowTabs: overflow, overflowActive: isOverflowActive };
  }, [tabs, location.pathname]);

  // On native, always show (no md:hidden). On web, only show on mobile.
  if (!isDashboard) return null;

  return (
    <nav
      className={cn(
        'fixed left-0 right-0 z-50',
        'bottom-0 pb-[env(safe-area-inset-bottom)]',
        'bg-background/95 backdrop-blur-lg border-t border-border',
        !isNative && 'md:hidden'
      )}
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {primaryTabs.map(({ id, label, to, iconKey }) => {
          const Icon = ICONS[iconKey] ?? Home;
          return (
            <NavLink
              key={id}
              to={to}
              onClick={triggerHaptic}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5',
                  'text-[11px] font-medium transition-all duration-200',
                  'active:scale-[0.96] will-change-transform min-w-[48px]',
                  isNative ? 'h-16' : 'h-14',
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground'
                )
              }
            >
              {({ isActive }) => (
                <div className={cn(
                  'flex flex-col items-center justify-center gap-0.5 transition-all duration-200',
                  isActive && isNative && 'bg-primary/10 rounded-xl px-3 py-1'
                )}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="leading-none">{label}</span>
                </div>
              )}
            </NavLink>
          );
        })}

        {overflowTabs.length > 0 && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                onClick={triggerHaptic}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5',
                  'text-[11px] font-medium transition-all duration-200',
                  'active:scale-[0.96] will-change-transform min-w-[48px]',
                  isNative ? 'h-16' : 'h-14',
                  overflowActive ? 'text-primary font-semibold' : 'text-muted-foreground'
                )}
                aria-label="More"
              >
                <div className={cn(
                  'flex flex-col items-center justify-center gap-0.5 transition-all duration-200',
                  overflowActive && isNative && 'bg-primary/10 rounded-xl px-3 py-1'
                )}>
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  <span className="leading-none">More</span>
                </div>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="p-0">
              <SheetHeader className="p-4 pb-2">
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="p-2">
                {overflowTabs.map((t) => {
                  const Icon = ICONS[t.iconKey] ?? Home;
                  return (
                    <NavLink
                      key={t.id}
                      to={t.to}
                      onClick={() => {
                        triggerHaptic();
                        setMoreOpen(false);
                      }}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-3',
                          isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )
                      }
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span className="text-sm font-medium">{t.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}

        {overflowTabs.length === 0 && primaryTabs.length < 5 &&
          Array.from({ length: 5 - primaryTabs.length }).map((_, i) => (
            <div key={`pad_${i}`} className={isNative ? 'h-16' : 'h-14'} />
          ))}
      </div>
    </nav>
  );
}
