import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  ClipboardList,
  Settings,
  BarChart3,
  Briefcase,
  UserCircle,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronDown,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: Home },
  { name: 'Scheduler', href: '/admin/scheduler', icon: Calendar },
  { name: 'Bookings', href: '/admin/bookings', icon: ClipboardList },
  { name: 'Customers', href: '/admin/customers', icon: Users },
  { name: 'Services', href: '/admin/services', icon: Briefcase },
  { name: 'Staff', href: '/admin/staff', icon: UserCircle },
  { name: 'Reports', href: '/admin/reports', icon: BarChart3 },
];

const settingsNav = [
  { name: 'Settings', href: '/admin/settings', icon: Settings },
  { name: 'Billing', href: '/admin/billing', icon: CreditCard },
  { name: 'Notifications', href: '/admin/notifications', icon: Bell },
  { name: 'Help', href: '/admin/help', icon: HelpCircle },
];

export function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const userInitials = user?.user_metadata?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U';

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Calendar className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-sidebar-foreground">BookingPro</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/admin' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn('sidebar-link', isActive && 'active')}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          <p className="px-3 mb-2 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Settings
          </p>
          <div className="space-y-1">
            {settingsNav.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn('sidebar-link', isActive && 'active')}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User Profile */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-medium text-primary-foreground">
            {userInitials}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-sidebar-foreground">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60">Admin</p>
          </div>
          <ChevronDown className={cn(
            "w-4 h-4 text-sidebar-foreground/60 transition-transform",
            isProfileOpen && "rotate-180"
          )} />
        </button>
        
        {isProfileOpen && (
          <div className="mt-2 py-2 space-y-1 animate-fade-in">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <UserCircle className="w-4 h-4" />
              <span className="text-sm">Profile</span>
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
