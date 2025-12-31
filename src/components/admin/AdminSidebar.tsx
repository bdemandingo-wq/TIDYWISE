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
  MessageSquare,
  MapPin,
  CheckSquare,
  CreditCard,
  Sparkles,
  HelpCircle,
  GripVertical,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { DemoModeToggle } from './DemoModeToggle';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const defaultNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Scheduler', href: '/dashboard/scheduler', icon: Calendar },
  { name: 'Bookings', href: '/dashboard/bookings', icon: ClipboardList },
  { name: 'Recurring', href: '/dashboard/recurring', icon: Repeat },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Leads', href: '/dashboard/leads', icon: Target },
  { name: 'Operations', href: '/dashboard/operations', icon: MapPin },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { name: 'Services', href: '/dashboard/services', icon: Briefcase },
  { name: 'Staff', href: '/dashboard/staff', icon: UserCircle },
  { name: 'Checklists', href: '/dashboard/checklists', icon: CheckSquare },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Discounts', href: '/dashboard/discounts', icon: Tag },
  { name: 'Payroll', href: '/dashboard/payroll', icon: DollarSign },
  { name: 'Finance', href: '/dashboard/finance', icon: Receipt },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
  { name: 'Subscription', href: '/dashboard/subscription', icon: Sparkles },
  { name: 'Payment Setup', href: '/dashboard/payment-integration', icon: CreditCard },
  { name: 'Help', href: '/dashboard/help', icon: HelpCircle },
];

const iconMap: Record<string, typeof Home> = {
  Home, Calendar, ClipboardList, Repeat, Users, Target, MapPin, MessageSquare,
  Briefcase, UserCircle, CheckSquare, Package, DollarSign, Receipt, BarChart3,
  Sparkles, CreditCard, HelpCircle, Tag,
};

interface NavItem {
  name: string;
  href: string;
  icon: typeof Home;
}

interface AdminSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface SortableNavItemProps {
  item: NavItem;
  isActive: boolean;
  isOpen: boolean;
  isMobile: boolean;
  onNavClick: () => void;
}

function SortableNavItem({ item, isActive, isOpen, isMobile, onNavClick }: SortableNavItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.href });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center group"
    >
      <button
        {...attributes}
        {...listeners}
        className={cn(
          "p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity",
          isDragging && "opacity-100"
        )}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <Link
        to={item.href}
        onClick={onNavClick}
        className={cn(
          'sidebar-link flex-1',
          isActive && 'active',
          !isOpen && !isMobile && 'justify-center px-2'
        )}
        title={!isOpen && !isMobile ? item.name : undefined}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {(isOpen || isMobile) && <span>{item.name}</span>}
      </Link>
    </div>
  );
}

export function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organization, isOwner } = useOrganization();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<NavItem[]>(defaultNavigation);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load navigation order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem('tidywise_nav_order');
    if (savedOrder) {
      try {
        const hrefOrder: string[] = JSON.parse(savedOrder);
        const reordered = hrefOrder
          .map(href => defaultNavigation.find(item => item.href === href))
          .filter((item): item is NavItem => item !== undefined);
        
        // Add any new nav items that weren't in saved order
        defaultNavigation.forEach(item => {
          if (!reordered.find(r => r.href === item.href)) {
            reordered.push(item);
          }
        });
        
        setNavigation(reordered);
      } catch (e) {
        console.error('Error parsing nav order:', e);
      }
    }
  }, []);

  useEffect(() => {
    const fetchLogo = async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('logo_url')
        .limit(1)
        .maybeSingle();
      
      if (data?.logo_url) {
        setLogoUrl(data.logo_url);
      }
    };
    fetchLogo();
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setNavigation((items) => {
        const oldIndex = items.findIndex(item => item.href === active.id);
        const newIndex = items.findIndex(item => item.href === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Save to localStorage
        localStorage.setItem('tidywise_nav_order', JSON.stringify(newOrder.map(i => i.href)));
        
        return newOrder;
      });
    }
  };

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
        {logoUrl ? (
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-background">
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
        {(isOpen || isMobile) && (
          <span className="text-lg font-bold text-sidebar-foreground">{businessName}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={navigation.map(item => item.href)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href || 
                  (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
                return (
                  <SortableNavItem
                    key={item.href}
                    item={item}
                    isActive={isActive}
                    isOpen={isOpen}
                    isMobile={isMobile}
                    onNavClick={handleNavClick}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>

        {/* Demo Mode Toggle */}
        <div className="mt-4 pt-4 border-t border-sidebar-border">
          <DemoModeToggle isOpen={isOpen} isMobile={isMobile} />
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
