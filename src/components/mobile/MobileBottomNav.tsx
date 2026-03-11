import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Users, Target, MessageSquare, Settings, Calendar, BarChart3,
  ClipboardList, Bell, Plus, Brain, CalendarDays, Repeat, UserCircle,
  FileText, ListTodo, Crosshair, Megaphone, MessageCircle, Wrench,
  UsersRound, CheckSquare, Camera, Package, Percent, DollarSign,
  Receipt, PieChart, CreditCard, Zap, Briefcase, Image,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';

export type MobileNavItem = {
  id: string;
  label: string;
  to: string;
  iconKey: string;
};

export const DEFAULT_SLOTS: MobileNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', iconKey: 'Home' },
  { id: 'scheduler', label: 'Calendar', to: '/dashboard/scheduler', iconKey: 'Calendar' },
  // center slot is the + button (not stored)
  { id: 'bookings', label: 'Bookings', to: '/dashboard/bookings', iconKey: 'CalendarDays' },
  { id: 'reports', label: 'Reports', to: '/dashboard/reports', iconKey: 'BarChart3' },
];

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Users, Target, MessageSquare, Settings, Calendar, BarChart3,
  ClipboardList, Bell, Brain, CalendarDays, Repeat, UserCircle,
  FileText, ListTodo, Crosshair, Megaphone, MessageCircle, Wrench,
  UsersRound, CheckSquare, Camera, Package, Percent, DollarSign,
  Receipt, PieChart, CreditCard, Zap, Briefcase, Image,
  Plus,
};

export const ALL_NAV_PAGES: Array<{ id: string; label: string; to: string; iconKey: string }> = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', iconKey: 'Home' },
  { id: 'ai-intelligence', label: 'AI Intelligence', to: '/dashboard/ai-intelligence', iconKey: 'Brain' },
  { id: 'scheduler', label: 'Scheduler', to: '/dashboard/scheduler', iconKey: 'Calendar' },
  { id: 'bookings', label: 'Bookings', to: '/dashboard/bookings', iconKey: 'CalendarDays' },
  { id: 'recurring', label: 'Recurring', to: '/dashboard/recurring', iconKey: 'Repeat' },
  { id: 'customers', label: 'Customers', to: '/dashboard/customers', iconKey: 'Users' },
  { id: 'client-portal', label: 'Client Portal', to: '/dashboard/client-portal', iconKey: 'UserCircle' },
  { id: 'invoices', label: 'Invoices', to: '/dashboard/invoices', iconKey: 'FileText' },
  { id: 'messages', label: 'Messages', to: '/dashboard/messages', iconKey: 'MessageSquare' },
  { id: 'tasks', label: 'Tasks', to: '/dashboard/tasks', iconKey: 'ListTodo' },
  { id: 'leads', label: 'Leads', to: '/dashboard/leads', iconKey: 'Target' },
  { id: 'operations', label: 'Operations', to: '/dashboard/operations', iconKey: 'Crosshair' },
  { id: 'campaigns', label: 'Campaigns', to: '/dashboard/campaigns', iconKey: 'Megaphone' },
  { id: 'feedback', label: 'Feedback', to: '/dashboard/feedback', iconKey: 'MessageCircle' },
  { id: 'services', label: 'Services', to: '/dashboard/services', iconKey: 'Wrench' },
  { id: 'staff', label: 'Staff', to: '/dashboard/staff', iconKey: 'UsersRound' },
  { id: 'checklists', label: 'Checklists', to: '/dashboard/checklists', iconKey: 'CheckSquare' },
  { id: 'booking-photos', label: 'Booking Photos', to: '/dashboard/booking-photos', iconKey: 'Camera' },
  { id: 'inventory', label: 'Inventory', to: '/dashboard/inventory', iconKey: 'Package' },
  { id: 'discounts', label: 'Discounts', to: '/dashboard/discounts', iconKey: 'Percent' },
  { id: 'payroll', label: 'Payroll', to: '/dashboard/payroll', iconKey: 'DollarSign' },
  { id: 'expenses', label: 'Expenses', to: '/dashboard/expenses', iconKey: 'Receipt' },
  { id: 'finance', label: 'Finance', to: '/dashboard/finance', iconKey: 'PieChart' },
  { id: 'reports', label: 'Reports', to: '/dashboard/reports', iconKey: 'BarChart3' },
  { id: 'subscription', label: 'Subscription', to: '/dashboard/subscription', iconKey: 'CreditCard' },
  { id: 'automation-center', label: 'Automation Center', to: '/dashboard/automation-center', iconKey: 'Zap' },
  { id: 'payment-integration', label: 'Payment Setup', to: '/dashboard/payment-integration', iconKey: 'Briefcase' },
];

function isDashboardRoute(pathname: string) {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/admin');
}

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { organizationId } = useOrgId();
  const [slots, setSlots] = useState<MobileNavItem[]>(DEFAULT_SLOTS);

  const isDashboard = isDashboardRoute(location.pathname);

  const triggerHaptic = useCallback(async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
  }, []);

  useEffect(() => {
    if (!isDashboard || !organizationId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('organization_mobile_nav_settings')
          .select('items')
          .eq('organization_id', organizationId)
          .eq('role', 'admin')
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

        if (!cancelled && sanitized.length === 4) {
          setSlots(sanitized);
        }
      } catch {
        if (!cancelled) setSlots(DEFAULT_SLOTS);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [organizationId, isDashboard]);

  if (!isDashboard) return null;

  const leftSlots = slots.slice(0, 2);
  const rightSlots = slots.slice(2, 4);

  const handleAdd = () => {
    triggerHaptic();
    navigate('/dashboard/bookings', { state: { openAddBooking: true } });
  };

  return (
    <nav
      className={cn(
        'fixed left-0 right-0 z-50 md:hidden',
        'bottom-0 pb-[env(safe-area-inset-bottom)]',
        'bg-background/95 backdrop-blur-md border-t border-border/30'
      )}
      aria-label="Primary"
    >
      <div className="relative grid grid-cols-5 items-end">
        {/* Left 2 slots */}
        {leftSlots.map((item) => (
          <NavItem key={item.id} item={item} onTap={triggerHaptic} currentPath={location.pathname} />
        ))}

        {/* Center + FAB */}
        <div className="flex items-center justify-center relative">
          <button
            type="button"
            onClick={handleAdd}
            className={cn(
              'absolute -top-4 flex items-center justify-center',
              'w-14 h-14 rounded-full',
              'bg-primary text-primary-foreground',
              'shadow-lg shadow-primary/30',
              'active:scale-95 transition-transform duration-150',
              'touch-manipulation'
            )}
            aria-label="New booking"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
          {/* Spacer to keep grid height */}
          <div className="h-14" />
        </div>

        {/* Right 2 slots */}
        {rightSlots.map((item) => (
          <NavItem key={item.id} item={item} onTap={triggerHaptic} currentPath={location.pathname} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({ item, onTap, currentPath }: { item: MobileNavItem; onTap: () => void; currentPath: string }) {
  const Icon = ICON_MAP[item.iconKey] ?? Home;
  const isActive = currentPath === item.to || (item.to !== '/dashboard' && currentPath.startsWith(item.to + '/'));
  const isExactDashboard = item.to === '/dashboard' && currentPath === '/dashboard';
  const active = isActive || isExactDashboard;

  return (
    <NavLink
      to={item.to}
      onClick={onTap}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5',
        'text-[10px] font-medium transition-all duration-200',
        'active:scale-[0.96] will-change-transform touch-manipulation',
        'h-14',
        active ? 'text-primary font-semibold' : 'text-muted-foreground'
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="leading-none">{item.label}</span>
    </NavLink>
  );
}
