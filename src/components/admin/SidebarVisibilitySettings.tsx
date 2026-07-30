import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSidebarHiddenItems } from '@/hooks/useSidebarHiddenItems';
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
  Loader2,
  Zap,
  Bell,
  Navigation as NavigationIcon,
} from 'lucide-react';

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, required: true },
  { name: 'Scheduler', href: '/dashboard/scheduler', icon: Calendar },
  { name: 'Tracking', href: '/dashboard/tracking', icon: NavigationIcon },
  { name: 'Bookings', href: '/dashboard/bookings', icon: ClipboardList },
  { name: 'Recurring', href: '/dashboard/recurring', icon: Repeat },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { name: 'Leads', href: '/dashboard/leads', icon: Target },
  { name: 'Operations', href: '/dashboard/operations', icon: MapPin },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: Zap },
  { name: 'Discounts', href: '/dashboard/discounts', icon: Tag },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { name: 'Services', href: '/dashboard/services', icon: Briefcase },
  { name: 'Staff', href: '/dashboard/staff', icon: UserCircle },
  { name: 'Checklists', href: '/dashboard/checklists', icon: CheckSquare },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Payroll', href: '/dashboard/payroll', icon: DollarSign },
  { name: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
  { name: 'Finance', href: '/dashboard/finance', icon: Receipt },
  { name: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
  { name: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { name: 'AI Intelligence', href: '/dashboard/ai-intelligence', icon: Sparkles },
  { name: 'Subscription', href: '/dashboard/subscription', icon: CreditCard },
  { name: 'Payment Setup', href: '/dashboard/payment-integration', icon: CreditCard },
  { name: 'Help Videos', href: '/dashboard/help', icon: HelpCircle },
];

export function SidebarVisibilitySettings() {
  const { hiddenItems: savedHidden, isLoading, save, reset, refresh } = useSidebarHiddenItems();
  const [draftHidden, setDraftHidden] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Sync draft to saved whenever the DB result changes (e.g. after org switch).
  useEffect(() => {
    setDraftHidden(savedHidden);
  }, [savedHidden]);

  const hasChanges =
    JSON.stringify([...draftHidden].sort()) !== JSON.stringify([...savedHidden].sort());

  const toggleItem = (href: string) => {
    setDraftHidden((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save(draftHidden);
      refresh();
      toast.success('Sidebar settings saved');
    } catch (e) {
      console.error('Error saving preferences:', e);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setResetting(true);
    try {
      await reset();
      // Legacy ordering key is unrelated to visibility but historically was
      // cleared here — keep that behaviour for consistency.
      try {
        localStorage.removeItem('tidywise_nav_order');
      } catch {
        /* ignore */
      }
      setDraftHidden([]);
      refresh();
      toast.success('Sidebar reset to default');
    } catch (e) {
      console.error('Error resetting preferences:', e);
      toast.error('Failed to reset settings');
    } finally {
      setResetting(false);
    }
  };

  const visibleCount = sidebarItems.length - draftHidden.length;
  const busy = saving || resetting;

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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefault} className="gap-2" disabled={busy}>
              {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Reset
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="gap-2"
              disabled={busy || !hasChanges}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary">{visibleCount} visible</Badge>
          {draftHidden.length > 0 && (
            <Badge variant="outline">{draftHidden.length} hidden</Badge>
          )}
          {hasChanges && (
            <Badge variant="secondary" className="bg-warning text-warning-foreground">Unsaved changes</Badge>
          )}
          {isLoading && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isHidden = draftHidden.includes(item.href);
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
                      disabled={busy}
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
