import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, TrendingUp, Zap, Clock, Sun } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
import { QueryError } from '@/components/QueryError';

interface SurgeSettings {
  surge_weekend_enabled: boolean;
  surge_weekend_multiplier: number;
  surge_lastminute_enabled: boolean;
  surge_lastminute_hours: number;
  surge_lastminute_multiplier: number;
  surge_holiday_enabled: boolean;
  surge_holiday_multiplier: number;
}

const SURGE_DEFAULTS: SurgeSettings = {
  surge_weekend_enabled: false,
  surge_weekend_multiplier: 1.15,
  surge_lastminute_enabled: false,
  surge_lastminute_hours: 48,
  surge_lastminute_multiplier: 1.20,
  surge_holiday_enabled: false,
  surge_holiday_multiplier: 1.25,
};

export function SurgePricingSettings() {
  const { organization } = useOrganization();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SurgeSettings>(SURGE_DEFAULTS);

  const { data: surgeData, isLoading: loading, error: surgeError, refetch } = useQuery({
    queryKey: ['surge-pricing', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await (supabase
        .from('business_settings' as any) as any)
        .select('surge_weekend_enabled,surge_weekend_multiplier,surge_lastminute_enabled,surge_lastminute_hours,surge_lastminute_multiplier,surge_holiday_enabled,surge_holiday_multiplier')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (surgeData) setSettings(s => ({ ...s, ...surgeData }));
  }, [surgeData]);

  const update = (key: keyof SurgeSettings, value: boolean | number) =>
    setSettings(s => ({ ...s, [key]: value }));

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_settings')
      .upsert(
        { ...settings, organization_id: organization.id },
        { onConflict: 'organization_id', ignoreDuplicates: false }
      );
    setSaving(false);
    if (error) toast.error('Failed to save: ' + error.message);
    else toast.success('Surge pricing saved');
  };

  const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;

  if (surgeError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-4 h-4" />
            Dynamic / Surge Pricing
          </CardTitle>
        </CardHeader>
        <CardContent><QueryError subject="surge pricing settings" onRetry={() => void refetch()} /></CardContent>
      </Card>
    );
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="w-4 h-4" />
          Dynamic / Surge Pricing
        </CardTitle>
        <p className="text-sm text-muted-foreground">Automatically charge more during high-demand windows. Applied to the public booking page.</p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Weekend */}
        <div className="space-y-3 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Weekend Premium</p>
                <p className="text-xs text-muted-foreground">Sat & Sun bookings</p>
              </div>
            </div>
            <Switch checked={settings.surge_weekend_enabled} onCheckedChange={(v) => update('surge_weekend_enabled', v)} />
          </div>
          {settings.surge_weekend_enabled && (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-24 shrink-0">Multiplier</Label>
              <input
                type="range" min="1.05" max="1.50" step="0.05"
                value={settings.surge_weekend_multiplier}
                onChange={(e) => update('surge_weekend_multiplier', parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-bold w-12 text-right text-amber-600">{pct(settings.surge_weekend_multiplier)}</span>
            </div>
          )}
        </div>

        {/* Last-minute */}
        <div className="space-y-3 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Last-Minute Premium</p>
                <p className="text-xs text-muted-foreground">Bookings within {settings.surge_lastminute_hours}h</p>
              </div>
            </div>
            <Switch checked={settings.surge_lastminute_enabled} onCheckedChange={(v) => update('surge_lastminute_enabled', v)} />
          </div>
          {settings.surge_lastminute_enabled && (
            <>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-24 shrink-0">Within (hours)</Label>
                <input
                  type="range" min="12" max="72" step="12"
                  value={settings.surge_lastminute_hours}
                  onChange={(e) => update('surge_lastminute_hours', parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-bold w-12 text-right text-blue-600">{settings.surge_lastminute_hours}h</span>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-24 shrink-0">Multiplier</Label>
                <input
                  type="range" min="1.05" max="1.50" step="0.05"
                  value={settings.surge_lastminute_multiplier}
                  onChange={(e) => update('surge_lastminute_multiplier', parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-bold w-12 text-right text-blue-600">{pct(settings.surge_lastminute_multiplier)}</span>
              </div>
            </>
          )}
        </div>

        {/* Holiday */}
        <div className="space-y-3 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Holiday Premium</p>
                <p className="text-xs text-muted-foreground">US federal holidays</p>
              </div>
            </div>
            <Switch checked={settings.surge_holiday_enabled} onCheckedChange={(v) => update('surge_holiday_enabled', v)} />
          </div>
          {settings.surge_holiday_enabled && (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground w-24 shrink-0">Multiplier</Label>
              <input
                type="range" min="1.05" max="1.75" step="0.05"
                value={settings.surge_holiday_multiplier}
                onChange={(e) => update('surge_holiday_multiplier', parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-bold w-12 text-right text-purple-600">{pct(settings.surge_holiday_multiplier)}</span>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Surge Pricing
        </Button>
      </CardContent>
    </Card>
  );
}
