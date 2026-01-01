import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Home,
  Calendar,
  ClipboardList,
  Repeat,
  Users,
  Target,
  MapPin,
  MessageSquare,
  Briefcase,
  UserCircle,
  CheckSquare,
  Package,
  DollarSign,
  Receipt,
  BarChart3,
  Sparkles,
  CreditCard,
  HelpCircle,
  Tag,
  PanelLeft,
  RotateCcw,
} from 'lucide-react';

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, required: true },
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

export function SidebarVisibilitySettings() {
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('tidywise_nav_hidden');
    if (saved) {
      try {
        setHiddenItems(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading hidden items:', e);
      }
    }
  }, []);

  const toggleItem = (href: string) => {
    setHiddenItems(prev => {
      const newHidden = prev.includes(href)
        ? prev.filter(h => h !== href)
        : [...prev, href];
      
      localStorage.setItem('tidywise_nav_hidden', JSON.stringify(newHidden));
      // Dispatch custom event for same-tab updates
      window.dispatchEvent(new Event('navHiddenChanged'));
      
      return newHidden;
    });
  };

  const resetToDefault = () => {
    setHiddenItems([]);
    localStorage.removeItem('tidywise_nav_hidden');
    localStorage.removeItem('tidywise_nav_order');
    window.dispatchEvent(new Event('navHiddenChanged'));
    toast.success('Sidebar reset to default');
  };

  const visibleCount = sidebarItems.length - hiddenItems.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PanelLeft className="w-5 h-5" />
              Sidebar Navigation
            </CardTitle>
            <CardDescription className="mt-1">
              Choose which menu items to show in your sidebar. Drag items in the sidebar to reorder them.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={resetToDefault} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary">{visibleCount} visible</Badge>
          {hiddenItems.length > 0 && (
            <Badge variant="outline">{hiddenItems.length} hidden</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isHidden = hiddenItems.includes(item.href);
            const isRequired = item.required;
            
            return (
              <div
                key={item.href}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  isHidden ? 'bg-muted/50 opacity-60' : 'bg-card'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isHidden ? 'text-muted-foreground' : 'text-primary'}`} />
                  <div>
                    <span className={`font-medium ${isHidden ? 'text-muted-foreground' : ''}`}>
                      {item.name}
                    </span>
                    {isRequired && (
                      <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isRequired && (
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={() => toggleItem(item.href)}
                    />
                  )}
                  {isRequired && (
                    <span className="text-xs text-muted-foreground">Always visible</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="text-sm text-muted-foreground mt-4">
          💡 Tip: You can also drag and drop items in the sidebar to reorder them. The P&L Overview is located under <strong>Reports</strong>.
        </p>
      </CardContent>
    </Card>
  );
}