import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';
import { PanelLeft, RotateCcw, Loader2 } from 'lucide-react';
import { NAV_ITEMS, resolveNavIcon } from '@/lib/navIcons';
import { useNavIconOverrides } from '@/hooks/useNavIconOverrides';
import { NavIconPicker } from '@/components/admin/NavIconPicker';

// Dashboard is always required/visible. Everything else can be toggled off.
const REQUIRED_HREFS = new Set(['/dashboard']);

export function SidebarVisibilitySettings() {
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [initialHiddenItems, setInitialHiddenItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { user } = useAuth();
  const { organizationId } = useOrgId();
  const { overrides, setIcon, resetAll: resetIcons } = useNavIconOverrides();

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

  useEffect(() => {
    const changed = JSON.stringify(hiddenItems.sort()) !== JSON.stringify(initialHiddenItems.sort());
    setHasChanges(changed);
  }, [hiddenItems, initialHiddenItems]);

  const toggleItem = (href: string) => {
    setHiddenItems(prev => {
      const newHidden = prev.includes(href)
        ? prev.filter(h => h !== href)
        : [...prev, href];
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
        }, { onConflict: 'user_id,organization_id,preference_key' });
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

    if (user?.id && organizationId) {
      await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', 'sidebar_hidden');
    }
    try {
      await resetIcons();
    } catch (e) {
      console.error('Error resetting icons:', e);
    }
    toast.success('Sidebar reset to default');
  };

  const handlePickIcon = async (navId: string, key: string) => {
    try {
      await setIcon(navId, key);
    } catch {
      toast.error('Could not save icon');
    }
  };

  const visibleCount = NAV_ITEMS.length - hiddenItems.length;

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
              Toggle items on or off and pick a Lucide icon for each. Changes sync across desktop, mobile, and the app.
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
        <div className="grid gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = resolveNavIcon(item, overrides);
            const isHidden = hiddenItems.includes(item.href);
            const isRequired = REQUIRED_HREFS.has(item.href);
            const currentKey = overrides[item.id] ?? item.defaultIconKey;

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                  isHidden ? 'bg-muted/50 opacity-60' : 'bg-card'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-5 h-5 shrink-0 ${isHidden ? 'text-muted-foreground' : 'text-primary'}`} />
                  <div className="min-w-0">
                    <span className={`font-medium ${isHidden ? 'text-muted-foreground' : ''}`}>
                      {item.name}
                    </span>
                    {isRequired && (
                      <Badge variant="secondary" className="ml-2 text-xs">Required</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <NavIconPicker
                    label={item.name}
                    currentKey={currentKey}
                    onPick={(k) => handlePickIcon(item.id, k)}
                  />
                  {!isRequired ? (
                    <Switch
                      checked={!isHidden}
                      onCheckedChange={() => toggleItem(item.href)}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Always visible</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          💡 Tip: Drag items in the sidebar to reorder them. Icon changes appear immediately.
        </p>
      </CardContent>
    </Card>
  );
}
