import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';
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
} from 'lucide-react';

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, required: true },
  { name: 'Scheduler', href: '/dashboard/scheduler', icon: Calendar },
  { name: 'Bookings', href: '/dashboard/bookings', icon: ClipboardList },
  { name: 'Recurring', href: '/dashboard/recurring', icon: Repeat },
  { name: 'Customers', href: '/dashboard/customers', icon: Users },
  { name: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { name: 'Leads', href: '/dashboard/leads', icon: Target },
  { name: 'Operations', href: '/dashboard/operations', icon: MapPin },
  { name: 'Campaigns', href: '/dashboard/campaigns', icon: Zap },
  { name: 'Feedback', href: '/dashboard/feedback', icon: MessageSquare },
  { name: 'Services', href: '/dashboard/services', icon: Briefcase },
  { name: 'Staff', href: '/dashboard/staff', icon: UserCircle },
  { name: 'Checklists', href: '/dashboard/checklists', icon: CheckSquare },
  { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
  { name: 'Discounts', href: '/dashboard/discounts', icon: Tag },
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
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [initialHiddenItems, setInitialHiddenItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { user } = useAuth();
  const { organizationId } = useOrgId();

  // Load from database on mount
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.id || !organizationId) return;
      
      const { data } = await supabase
        .from('user_preferences')
        .select('preference_value')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', 'sidebar_hidden')
        .maybeSingle();
      
      if (data?.preference_value) {
        const hidden = data.preference_value as string[];
        setHiddenItems(hidden);
        setInitialHiddenItems(hidden);
        // Sync to localStorage for sidebar component
        localStorage.setItem('tidywise_nav_hidden', JSON.stringify(hidden));
        window.dispatchEvent(new Event('navHiddenChanged'));
      } else {
        setHiddenItems([]);
        setInitialHiddenItems([]);
        localStorage.removeItem('tidywise_nav_hidden');
        window.dispatchEvent(new Event('navHiddenChanged'));
      }
    };
    
    loadPreferences();
  }, [user?.id, organizationId]);

  // Track changes
  useEffect(() => {
    const changed = JSON.stringify(hiddenItems.sort()) !== JSON.stringify(initialHiddenItems.sort());
    setHasChanges(changed);
  }, [hiddenItems, initialHiddenItems]);

  const saveToDatabase = async (newHidden: string[]) => {
    if (!user?.id || !organizationId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          organization_id: organizationId,
          preference_key: 'sidebar_hidden',
          preference_value: newHidden,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,organization_id,preference_key'
        });
      
      if (error) throw error;
    } catch (e) {
      console.error('Error saving preferences:', e);
      toast.error('Failed to save preference');
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (href: string) => {
    setHiddenItems(prev => {
      const newHidden = prev.includes(href)
        ? prev.filter(h => h !== href)
        : [...prev, href];
      
      // Update localStorage for instant preview
      localStorage.setItem('tidywise_nav_hidden', JSON.stringify(newHidden));
      window.dispatchEvent(new Event('navHiddenChanged'));
      
      return newHidden;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user!.id,
          organization_id: organizationId,
          preference_key: 'sidebar_hidden',
          preference_value: hiddenItems,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,organization_id,preference_key'
        });
      
      if (error) throw error;
      
      setInitialHiddenItems([...hiddenItems]);
      toast.success('Sidebar settings saved');
    } catch (e) {
      console.error('Error saving preferences:', e);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async () => {
    setHiddenItems([]);
    setInitialHiddenItems([]);
    localStorage.removeItem('tidywise_nav_hidden');
    localStorage.removeItem('tidywise_nav_order');
    window.dispatchEvent(new Event('navHiddenChanged'));
    
    // Delete from database
    if (user?.id && organizationId) {
      await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', 'sidebar_hidden');
    }
    
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefault} className="gap-2" disabled={saving}>
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              className="gap-2" 
              disabled={saving || !hasChanges}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="secondary">{visibleCount} visible</Badge>
          {hiddenItems.length > 0 && (
            <Badge variant="outline">{hiddenItems.length} hidden</Badge>
          )}
          {hasChanges && (
            <Badge variant="secondary" className="bg-warning text-warning-foreground">Unsaved changes</Badge>
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