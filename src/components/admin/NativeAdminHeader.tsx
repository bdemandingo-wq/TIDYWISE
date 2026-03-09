import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Calendar, ClipboardList, Repeat, Users, Target, MapPin,
  MessageSquare, Briefcase, UserCircle, CheckSquare, Package,
  DollarSign, Receipt, BarChart3, Sparkles, CreditCard, HelpCircle,
  Tag, Brain, Globe, Zap, Camera, Settings, LogOut, Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';
import { useAuth } from '@/hooks/useAuth';
import { usePlatform } from '@/hooks/usePlatform';

const iconMap: Record<string, typeof Home> = {
  Home, Calendar, ClipboardList, Repeat, Users, Target, MapPin,
  MessageSquare, Briefcase, UserCircle, CheckSquare, Package,
  DollarSign, Receipt, BarChart3, Sparkles, CreditCard, HelpCircle,
  Tag, Brain, Globe, Zap, Camera, Settings,
};

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'AI Intelligence', href: '/dashboard/ai-intelligence', icon: Brain },
  { name: 'Scheduler', href: '/dashboard/scheduler', icon: Calendar },
  { name: 'Bookings', href: '/dashboard/bookings', icon: ClipboardList },
  { name: 'Recurring', href: '/dashboard/recurring', icon: Repeat },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Client Portal', href: '/dashboard/client-portal', icon: Globe },
  { name: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
  { name: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { name: 'Tasks', href: '/dashboard/tasks', icon: CheckSquare },
  { name: 'Leads', href: '/dashboard/leads', icon: Target },
  { name: 'Operations', href: '/dashboard/operations', icon: MapPin },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: Zap },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { name: 'Services', href: '/dashboard/services', icon: Briefcase },
  { name: 'Staff', href: '/dashboard/staff', icon: UserCircle },
  { name: 'Checklists', href: '/dashboard/checklists', icon: CheckSquare },
  { name: 'Booking Photos', href: '/dashboard/booking-photos', icon: Camera },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Discounts', href: '/dashboard/discounts', icon: Tag },
  { name: 'Payroll', href: '/dashboard/payroll', icon: DollarSign },
  { name: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
  { name: 'Finance', href: '/dashboard/finance', icon: Receipt },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
  { name: 'Automation Center', href: '/dashboard/automation-center', icon: Zap },
  { name: 'Help', href: '/dashboard/help', icon: HelpCircle },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface NativeAdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function NativeAdminHeader({ title, subtitle, actions }: NativeAdminHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { canShowPaymentFlows } = usePlatform();

  const filteredItems = canShowPaymentFlows
    ? navItems
    : navItems.filter(i => i.href !== '/dashboard/payment-integration');

  const handleLogout = async () => {
    setDrawerOpen(false);
    await signOut();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/40 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between h-11 px-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold text-foreground truncate leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-1">
            {actions}
            <AdminNotificationBell />
            <Button
              variant="ghost"
              size="icon"
              className="min-w-[44px] min-h-[44px]"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="h-14 flex items-center px-5 border-b border-sidebar-border">
              <span className="text-lg font-bold text-sidebar-foreground">Menu</span>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-0.5">
                {filteredItems.map((item) => {
                  const isActive = location.pathname === item.href ||
                    (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                      )}
                    >
                      <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Logout */}
            <div className="border-t border-sidebar-border p-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-[18px] h-[18px]" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
