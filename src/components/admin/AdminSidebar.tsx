import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  ClipboardList,
  Settings,
  BarChart3,
  Briefcase,
  UserCircle,
  LogOut,
  ChevronDown,
  Home,
  DollarSign,
  Receipt,
  Package,
  Menu,
  Repeat,
  Target,
  FileText,
  MessageSquare,
  MapPin,
  Mail,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Scheduler', href: '/dashboard/scheduler', icon: Calendar },
  { name: 'Bookings', href: '/dashboard/bookings', icon: ClipboardList },
  { name: 'Recurring', href: '/dashboard/recurring', icon: Repeat },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Leads', href: '/dashboard/leads', icon: Target },
  { name: 'Invoices', href: '/dashboard/invoices', icon: FileText },
  { name: 'Operations', href: '/dashboard/operations', icon: MapPin },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { name: 'Services', href: '/dashboard/services', icon: Briefcase },
  { name: 'Staff', href: '/dashboard/staff', icon: UserCircle },
  { name: 'Checklists', href: '/dashboard/checklists', icon: CheckSquare },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: Mail },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Payroll', href: '/dashboard/payroll', icon: DollarSign },
  { name: 'Finance', href: '/dashboard/finance', icon: Receipt },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
];

interface AdminSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organization, isOwner } = useOrganization();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const userInitials = user?.user_metadata?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U';

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const businessName = organization?.name || 'My Business';

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Calendar className="w-5 h-5 text-primary-foreground" />
        </div>
        {(isOpen || isMobile) && (
          <span className="text-lg font-bold text-sidebar-foreground">{businessName}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={handleNavClick}
                className={cn(
                  'sidebar-link',
                  isActive && 'active',
                  !isOpen && !isMobile && 'justify-center px-2'
                )}
                title={!isOpen && !isMobile ? item.name : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {(isOpen || isMobile) && <span>{item.name}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Profile */}
      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
            !isOpen && !isMobile && "justify-center px-2"
          )}
        >
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-medium text-primary-foreground flex-shrink-0">
            {userInitials}
          </div>
          {(isOpen || isMobile) && (
            <>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-sidebar-foreground">{userName}</p>
                <p className="text-xs text-sidebar-foreground/60">{isOwner ? 'Owner' : 'Team Member'}</p>
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-sidebar-foreground/60 transition-transform",
                isProfileOpen && "rotate-180"
              )} />
            </>
          )}
        </button>
        
        {isProfileOpen && (isOpen || isMobile) && (
          <div className="mt-2 py-2 space-y-1 animate-fade-in">
            <button 
              onClick={() => {
                navigate('/dashboard/settings');
                handleNavClick();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
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
    </>
  );

  return (
    <>
      {/* Mobile Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar md:hidden">
          <div className="flex flex-col h-full">
            <SidebarContent isMobile />
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="w-6 h-6" />
      </Button>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar flex-col hidden md:flex transition-all duration-300",
        isOpen ? "w-64" : "w-16"
      )}>
        {/* Toggle Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 z-50 w-6 h-6 rounded-full bg-sidebar border border-sidebar-border shadow-sm hover:bg-sidebar-accent"
          onClick={onToggle}
        >
          <ChevronDown className={cn(
            "w-4 h-4 transition-transform",
            isOpen ? "-rotate-90" : "rotate-90"
          )} />
        </Button>

        <SidebarContent />
      </aside>
    </>
  );
}
