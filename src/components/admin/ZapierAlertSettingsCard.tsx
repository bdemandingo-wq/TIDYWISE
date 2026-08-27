import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell, Loader2, Save } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';
import { QueryError } from '@/components/QueryError';

interface AlertSettings {
  organization_id: string;
  enabled: boolean;
  failure_threshold: number;
  window_minutes: number;
  notify_inapp: boolean;
  notify_email: boolean;
  recipient_email: string | null;
  cooldown_minutes: number;
}

const DEFAULTS: Omit<AlertSettings, 'organization_id'> = {
  enabled: true,
  failure_threshold: 5,
  window_minutes: 15,
  notify_inapp: true,
  notify_email: false,
  recipient_email: '',
  cooldown_minutes: 30,
};

export function ZapierAlertSettingsCard() {
  const { organization } = useOrganization();
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<AlertSettings | null>(null);

  const { data: alertData, isLoading: loading, error: alertError, refetch } = useQuery({
    queryKey: ['zapier-alert-settings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await (supabase as any)
        .from('org_zapier_alert_settings')
        .select('*')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!organization?.id) return;
    if (alertError) return; // Don't populate form with defaults on error
    setS({
      organization_id: organization.id,
      ...DEFAULTS,
      ...(alertData ?? {}),
    } as AlertSettings);
  }, [alertData, alertError, organization?.id]);

  const save = async () => {
    if (!s || !organization?.id) return;
    if (s.notify_email && !s.recipient_email?.trim()) {
      toast.error('Recipient email required when email alerts are enabled');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('org_zapier_alert_settings')
      .upsert({ ...s, organization_id: organization.id }, { onConflict: 'organization_id' });
    setSaving(false);
    if (error) toast.error(error.message || 'Failed to save');
    else toast.success('Alert settings saved');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" /> Failure alerts
        </CardTitle>
        <CardDescription>
          Get notified when Zapier dispatch failures exceed a threshold within a time window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {alertError ? (
          <QueryError subject="alert settings" onRetry={() => void refetch()} />
        ) : loading || !s ? (
          <div className="py-6 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm font-medium">Enable alerts</Label>
                <p className="text-xs text-muted-foreground">Turn off to silence all alerts.</p>
              </div>
              <Switch
                checked={s.enabled}
                onCheckedChange={(v) => setS({ ...s, enabled: v })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Failure threshold</Label>
                <Input
                  type="number"
                  min={1}
                  value={s.failure_threshold}
                  onChange={(e) => setS({ ...s, failure_threshold: Math.max(1, +e.target.value || 1) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Within (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={s.window_minutes}
                  onChange={(e) => setS({ ...s, window_minutes: Math.max(1, +e.target.value || 1) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cooldown (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={s.cooldown_minutes}
                  onChange={(e) => setS({ ...s, cooldown_minutes: Math.max(1, +e.target.value || 1) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">In-app notification</Label>
                  <p className="text-xs text-muted-foreground">Appears in your admin bell menu.</p>
                </div>
                <Switch
                  checked={s.notify_inapp}
                  onCheckedChange={(v) => setS({ ...s, notify_inapp: v })}
                />
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Email notification</Label>
                    <p className="text-xs text-muted-foreground">Send an email when threshold is hit.</p>
                  </div>
                  <Switch
                    checked={s.notify_email}
                    onCheckedChange={(v) => setS({ ...s, notify_email: v })}
                  />
                </div>
                {s.notify_email && (
                  <Input
                    type="email"
                    placeholder="alerts@yourcompany.com"
                    value={s.recipient_email ?? ''}
                    onChange={(e) => setS({ ...s, recipient_email: e.target.value })}
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
