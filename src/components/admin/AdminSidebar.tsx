import { Link, useLocation, useNavigate, matchPath } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
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
  Activity,
  Zap,
  Brain,
  Globe,
  Camera,
  Plus,
  Check,
  Bell,
  Navigation as NavigationIcon,
  Gauge,
  Bug,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgRole } from '@/hooks/useOrgRole';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { getSignedUrl } from '@/hooks/useSignedUrl';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePlatform } from '@/hooks/usePlatform';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  { name: 'AI Intelligence', href: '/dashboard/ai-intelligence', icon: Brain },
  { name: 'Scheduler', href: '/dashboard/scheduler', icon: Calendar },
  { name: 'Tracking', href: '/dashboard/tracking', icon: NavigationIcon },
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
  { name: 'Benchmarks', href: '/dashboard/benchmarks', icon: Gauge },
  { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  
  { name: 'Automation Center', href: '/dashboard/automation-center', icon: Zap },
  { name: 'Payment Setup', href: '/dashboard/payment-integration', icon: CreditCard },
  { name: 'Help', href: '/dashboard/help', icon: HelpCircle },
  
];

const iconMap: Record<string, typeof Home> = {
  Home, Calendar, ClipboardList, Repeat, Users, Target, MapPin, MessageSquare,
  Briefcase, UserCircle, CheckSquare, Package, DollarSign, Receipt, BarChart3,
  Sparkles, CreditCard, HelpCircle, Tag, Activity, Brain, Globe, Zap, Camera, Gauge, Bug,
};

interface NavItem {
  name: string;
  href: string;
  icon: typeof Home;
  badge?: number;
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
      className="flex items-center group pointer-events-auto touch-manipulation"
    >
      <button
        {...attributes}
        {...listeners}
        className={cn(
          "p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation",
          isDragging && "opacity-100",
          isMobile && "hidden"
        )}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <Link
        to={item.href}
        onClick={onNavClick}
        className={cn(
          'sidebar-link flex-1 min-h-[44px] pointer-events-auto touch-manipulation',
          isActive && 'active',
          !isOpen && !isMobile && 'justify-center px-2'
        )}
        title={!isOpen && !isMobile ? item.name : undefined}
      >
        <item.icon className="w-5 h-5 flex-shrink-0" />
        {(isOpen || isMobile) && <span>{item.name}</span>}
        {item.badge !== undefined && item.badge > 0 && (
          <Badge variant="destructive" className="ml-auto h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full">
            {item.badge > 9 ? '9+' : item.badge}
          </Badge>
        )}
      </Link>
    </div>
  );
}

function StaticNavItem({ item, isActive, isOpen, isMobile, onNavClick }: SortableNavItemProps) {
  return (
    <Link
      to={item.href}
      onClick={onNavClick}
      style={{ position: 'relative', zIndex: 1 }}
      className={cn(
        'sidebar-link min-h-[44px] pointer-events-auto touch-manipulation',
        isActive && 'active',
        !isOpen && !isMobile && 'justify-center px-2'
      )}
      title={!isOpen && !isMobile ? item.name : undefined}
    >
      <item.icon className="w-5 h-5 flex-shrink-0" />
      {(isOpen || isMobile) && <span>{item.name}</span>}
      {item.badge !== undefined && item.badge > 0 && (
        <Badge variant="destructive" className="ml-auto h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full">
          {item.badge > 9 ? '9+' : item.badge}
        </Badge>
      )}
    </Link>
  );
}

export function AdminSidebar({ isOpen, onToggle }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organization, isOwner, allOrganizations, switchOrganization } = useOrganization();
  const isMobileDevice = useIsMobile();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [businessDisplayName, setBusinessDisplayName] = useState<string>('My Business');
  const [navigation, setNavigation] = useState<NavItem[]>(defaultNavigation);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [orgToDelete, setOrgToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingOrg, setIsDeletingOrg] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDeleteOrg = async () => {
    if (!orgToDelete) return;
    setIsDeletingOrg(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-my-organization', {
        body: { organizationId: orgToDelete.id },
      });
      if (error || (data && data.error)) {
        throw new Error(error?.message || data?.error || 'Delete failed');
      }
      toast({ title: 'Business deleted', description: `${orgToDelete.name} was removed.` });
      setOrgToDelete(null);
      // Refresh the org list so the switcher updates immediately.
      await queryClient.invalidateQueries();
      window.location.reload();
    } catch (e: any) {
      toast({
        title: 'Could not delete business',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingOrg(false);
    }
  };

  // Get pending booking requests count for badge
  const { data: pendingRequestsCount = 0 } = useQuery({
    queryKey: ['pending-booking-requests-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const { count, error } = await supabase
        .from('client_booking_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'pending');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!organization?.id,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Unread SMS messages count (sum of unread_count across conversations)
  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ['unread-messages-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const { data, error } = await supabase
        .from('sms_conversations')
        .select('unread_count')
        .eq('organization_id', organization.id);
      if (error || !data) return 0;
      return data.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
    },
    enabled: !!organization?.id,
    refetchInterval: 30000,
  });

  // Incomplete tasks count (badge disappears once task is checked off)
  const { data: openTasksCount = 0 } = useQuery({
    queryKey: ['open-tasks-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const { count, error } = await supabase
        .from('tasks_and_notes')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .in('type', ['daily', 'weekly', 'monthly'])
        .eq('is_completed', false);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!organization?.id,
    refetchInterval: 30000,
  });

  // Pending time-off requests count for Staff nav badge
  const { data: pendingTimeOffCount = 0 } = useQuery({
    queryKey: ['time-off-pending-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const { count } = await (supabase as any)
        .from('time_off_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'pending');
      return count || 0;
    },
    enabled: !!organization?.id,
    refetchInterval: 30000,
  });

  // Realtime — invalidate the pending count when a request is created/updated
  useEffect(() => {
    if (!organization?.id) return;
    const ch = supabase
      .channel(`sidebar-time-off-${organization.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_off_requests', filter: `organization_id=eq.${organization.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['time-off-pending-count', organization.id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organization?.id, queryClient]);

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

  // Load hidden items from localStorage
  useEffect(() => {
    const savedHidden = localStorage.getItem('tidywise_nav_hidden');
    if (savedHidden) {
      try {
        setHiddenItems(JSON.parse(savedHidden));
      } catch (e) {
        console.error('Error parsing hidden nav items:', e);
      }
    }
  }, []);

  // Listen for changes to hidden items (from settings page)
  useEffect(() => {
    const handleStorageChange = () => {
      const savedHidden = localStorage.getItem('tidywise_nav_hidden');
      if (savedHidden) {
        try {
          setHiddenItems(JSON.parse(savedHidden));
        } catch (e) {
          console.error('Error parsing hidden nav items:', e);
        }
      } else {
        setHiddenItems([]);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom event for same-tab updates
    window.addEventListener('navHiddenChanged', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('navHiddenChanged', handleStorageChange);
    };
  }, []);

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

  // Platform detection for App Store compliance
  const { canShowPaymentFlows } = usePlatform();
  
  // Items to hide on native apps (App Store compliance - no payment flows)
  const nativeHiddenItems = useMemo(() => {
    if (canShowPaymentFlows) return [];
    // Hide payment-related items on native platforms (App Store compliance)
    return ['/dashboard/payment-integration', '/dashboard/subscription'];
  }, [canShowPaymentFlows]);

  // Managers (invited teammates without financial access) must not see the
  // admin Dashboard, Payroll, Expenses, Finance, or Reports. Filter those
  // out of the sidebar entirely — the routes are also gated server-side.
  const { hasFinancialAccess } = useOrgRole();
  const financialOnlyHrefs = useMemo(
    () => new Set(['/dashboard', '/dashboard/payroll', '/dashboard/expenses', '/dashboard/finance', '/dashboard/reports']),
    []
  );

  // Filter out hidden items and add badges
  const visibleNavigation = navigation
    .filter(item => !hiddenItems.includes(item.href) && !nativeHiddenItems.includes(item.href))
    .filter(item => hasFinancialAccess || !financialOnlyHrefs.has(item.href))
    .map(item => {
      if (item.href === '/dashboard/client-portal' && pendingRequestsCount > 0) {
        return { ...item, badge: pendingRequestsCount };
      }
      if (item.href === '/dashboard/messages' && unreadMessagesCount > 0) {
        return { ...item, badge: unreadMessagesCount };
      }
      if (item.href === '/dashboard/tasks' && openTasksCount > 0) {
        return { ...item, badge: openTasksCount };
      }
      return item;
    });


  useEffect(() => {
    const fetchLogoAndName = async () => {
      if (!organization?.id) return;
      const { data } = await supabase
        .from('business_settings')
        .select('logo_url, company_name')
        .eq('organization_id', organization.id)
        .limit(1)
        .maybeSingle();
      
      if (data?.logo_url) {
        const raw = data.logo_url as string;
        if (raw.startsWith('storage:')) {
          const [, bucket, ...pathParts] = raw.split(':');
          const path = pathParts.join(':');
          try {
            const signed = await getSignedUrl(bucket, path, 86400);
            setLogoUrl(signed || raw);
          } catch {
            setLogoUrl(raw);
          }
        } else {
          setLogoUrl(raw);
        }
      }
      // Use company_name from business_settings if available, otherwise fall back to organization name
      if (data?.company_name) {
        setBusinessDisplayName(data.company_name);
      } else if (organization?.name) {
        setBusinessDisplayName(organization.name);
      }
    };
    fetchLogoAndName();
  }, [organization?.id, organization?.name]);

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

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border shrink-0">
        {logoUrl ? (
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-sidebar-accent shrink-0">
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" width={32} height={32} />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary-foreground" />
          </div>
        )}
        {(isOpen || isMobile) && (
          <span className="text-lg font-bold text-sidebar-foreground">{businessDisplayName}</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 pointer-events-auto touch-manipulation relative z-10">
        {(isMobile || isMobileDevice) ? (
          <div className="space-y-0.5">
            {visibleNavigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
              return (
                <StaticNavItem
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
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleNavigation.map(item => item.href)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1">
                {visibleNavigation.map((item) => {
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
        )}

        {/* Platform Admin Links - Only visible for support@tidywisecleaning.com */}
        {user?.email === 'support@tidywisecleaning.com' && (
          <div className="mt-4 pt-4 border-t border-sidebar-border space-y-1">
            <Link
              to="/dashboard/platform-analytics"
              onClick={handleNavClick}
              className={cn(
                'sidebar-link min-h-[44px] pointer-events-auto touch-manipulation',
                location.pathname === '/dashboard/platform-analytics' && 'active',
                !isOpen && !isMobile && 'justify-center px-2'
              )}
              title={!isOpen && !isMobile ? 'Platform Analytics' : undefined}
            >
              <Activity className="w-5 h-5 flex-shrink-0 text-amber-500" />
              {(isOpen || isMobile) && <span className="text-amber-500 font-medium">Platform Analytics</span>}
            </Link>
          </div>
        )}

      </nav>

      {/* Business Switcher */}
      <div className={cn("border-t border-sidebar-border p-3 shrink-0", isMobile && "pb-[calc(0.75rem+env(safe-area-inset-bottom))]")}>
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors min-h-[44px] pointer-events-auto touch-manipulation",
            !isOpen && !isMobile && "justify-center px-2"
          )}
        >
          {logoUrl ? (
            <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-sidebar-accent flex-shrink-0">
              <img src={logoUrl} alt="Business Logo" className="w-full h-full object-cover" width={36} height={36} />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-medium text-primary-foreground flex-shrink-0">
              {businessDisplayName.substring(0, 2).toUpperCase()}
            </div>
          )}
          {(isOpen || isMobile) && (
            <>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{businessDisplayName}</p>
                <p className="text-xs text-sidebar-foreground/60">{isOwner ? 'Owner' : 'Team Member'}</p>
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-sidebar-foreground/60 transition-transform flex-shrink-0",
                isProfileOpen && "rotate-180"
              )} />
            </>
          )}
        </button>
        
        {isProfileOpen && (isOpen || isMobile) && (
          <div className="mt-2 py-2 space-y-1 animate-fade-in">
            {/* Business list */}
            {allOrganizations.length > 1 && (
              <div className="pb-2 mb-2 border-b border-sidebar-border space-y-0.5">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 mb-1">Your Businesses</p>
                {allOrganizations.map((orgItem) => {
                  const isActive = orgItem.organization.id === organization?.id;
                  const initials = orgItem.organization.name.substring(0, 2).toUpperCase();
                  const roleLabel = orgItem.role === 'owner' ? 'Owner' : orgItem.role === 'admin' ? 'Admin' : 'Member';
                  return (
                    <div
                      key={orgItem.organization.id}
                      className={cn(
                        "group w-full flex items-center gap-2 pr-1 rounded-lg transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-foreground"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <button
                        onClick={() => {
                          if (!isActive) {
                            switchOrganization(orgItem.organization.id);
                          }
                        }}
                        className="flex-1 flex items-center gap-3 pl-3 py-2 rounded-lg min-h-[44px] pointer-events-auto touch-manipulation text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium truncate">{orgItem.organization.name}</p>
                          <p className="text-[10px] text-sidebar-foreground/50">{roleLabel}</p>
                        </div>
                        {isActive && (
                          <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                      </button>
                      {!isActive && orgItem.role === 'owner' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOrgToDelete({ id: orgItem.organization.id, name: orgItem.organization.name });
                          }}
                          aria-label={`Delete ${orgItem.organization.name}`}
                          className="p-2 rounded-md text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add New Business */}
            <button 
              onClick={() => {
                setIsProfileOpen(false);
                navigate('/onboarding?new=true');
                handleNavClick();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors min-h-[44px] pointer-events-auto touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Add New Business</span>
            </button>

            {/* Settings */}
            <button 
              onClick={() => {
                setIsProfileOpen(false);
                navigate('/dashboard/settings');
                handleNavClick();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors min-h-[44px] pointer-events-auto touch-manipulation"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </button>

            {/* Logout */}
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors min-h-[44px] pointer-events-auto touch-manipulation"
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
        <SheetContent side="left" className="w-64 p-0 bg-sidebar md:hidden z-[60] pointer-events-auto touch-manipulation">
          <div className="flex flex-col h-full pt-[env(safe-area-inset-top)]">
            <SidebarContent isMobile />
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="hamburger-menu-btn fixed top-[calc(0.25rem+env(safe-area-inset-top))] left-1 z-50 min-w-[44px] min-h-[44px] md:hidden bg-background/80 backdrop-blur-sm touch-manipulation pointer-events-auto"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="w-6 h-6" />
      </Button>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar flex-col transition-all duration-300",
        "hidden md:flex",
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

      <AlertDialog open={!!orgToDelete} onOpenChange={(open) => !open && !isDeletingOrg && setOrgToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {orgToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this business and all of its bookings, customers, invoices, messages, and settings. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingOrg}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrg}
              disabled={isDeletingOrg}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingOrg ? 'Deleting…' : 'Delete business'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
