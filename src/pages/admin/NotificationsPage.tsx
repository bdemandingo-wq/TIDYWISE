import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Bell, Loader2, Mail, Play, CheckCircle2, Smartphone, CreditCard, MessageSquare, Navigation, XCircle, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Skeleton } from '@/components/ui/skeleton';
import { SEOHead } from '@/components/SEOHead';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface NotificationSettings {
  notify_new_booking: boolean;
  notify_cancellations: boolean;
  notify_reminders: boolean;
  notify_sms: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  notify_new_booking: true,
  notify_cancellations: true,
  notify_reminders: true,
  notify_sms: false,
};

const PUSH_CATEGORIES = [
  { key: 'new_booking', label: 'New Booking', description: 'When a customer submits a booking request', icon: Bell },
  { key: 'booking_confirmed', label: 'Booking Confirmed', description: 'When a booking is confirmed and paid', icon: CheckCircle2 },
  { key: 'cancellation', label: 'Cancellation', description: 'When a customer cancels a booking', icon: XCircle },
  { key: 'cleaner_on_way', label: 'Cleaner On The Way', description: 'When a cleaner marks themselves en route', icon: Navigation },
  { key: 'payment_received', label: 'Payment Received', description: 'When an invoice is paid via Stripe', icon: CreditCard },
  { key: 'new_inbound_message', label: 'New Inbound Message', description: 'When a customer texts your business number', icon: MessageSquare },
  { key: 'new_facebook_lead', label: 'New Facebook Lead', description: 'When a lead comes in from your Facebook ad', icon: Users },
];

export default function NotificationsPage() {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingBrief, setSendingBrief] = useState(false);
  const [sendingEvening, setSendingEvening] = useState(false);
  const { isSupported, isRegistered, isRegistering, requestPermission } = usePushNotifications();

  useEffect(() => {
    if (!organization?.id) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('business_settings')
        .select('notify_new_booking, notify_cancellations, notify_reminders, notify_sms')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (!error && data) {
        setSettings({
          notify_new_booking: data.notify_new_booking ?? true,
          notify_cancellations: data.notify_cancellations ?? true,
          notify_reminders: data.notify_reminders ?? true,
          notify_sms: data.notify_sms ?? false,
        });
      }
      setLoading(false);
    };
    load();
  }, [organization?.id]);

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_settings')
      .update({
        notify_new_booking: settings.notify_new_booking,
        notify_cancellations: settings.notify_cancellations,
        notify_reminders: settings.notify_reminders,
        notify_sms: settings.notify_sms,
      })
      .eq('organization_id', organization.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to save notification settings');
    } else {
      toast.success('Notification settings saved!');
    }
  };

  const handleSendBrief = async () => {
    if (!organization?.id) return;
    setSendingBrief(true);
    try {
      const { data, error } = await supabase.functions.invoke('morning-brief', {
        body: { org_id: organization.id },
      });
      if (error) throw error;
      toast.success(`Morning brief sent! Jobs: ${data?.sections?.jobs ?? 0}, Estimates: ${data?.sections?.estimates ?? 0}, Requests: ${data?.sections?.requests ?? 0}`);
    } catch (e: any) {
      toast.error(`Failed to send morning brief: ${e.message}`);
    } finally {
      setSendingBrief(false);
    }
  };

  const handleSendEvening = async () => {
    if (!organization?.id) return;
    setSendingEvening(true);
    try {
      const { data, error } = await supabase.functions.invoke('evening-brief', {
        body: { org_id: organization.id },
      });
      if (error) throw error;
      toast.success(`End of day report sent! Completed: ${data?.summary?.completed ?? 0}, Revenue: $${data?.summary?.revenue?.toFixed(0) ?? 0}, Tomorrow: ${data?.summary?.tomorrow ?? 0}`);
    } catch (e: any) {
      toast.error(`Failed to send evening report: ${e.message}`);
    } finally {
      setSendingEvening(false);
    }
  };

  return (
    <AdminLayout
      title="Notifications"
      subtitle="Manage how you receive notifications"
    >
      <SEOHead title="Notifications | TidyWise" description="Configure notification preferences" noIndex />
      {loading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <Card key={i} className="mb-6">
              <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3].map(j => <Skeleton key={j} className="h-12 w-full" />)}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Push Notifications */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  Push Notifications
                </CardTitle>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  isRegistered
                    ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}>
                  {isRegistered ? '✓ Registered' : '⊘ Not Registered'}
                </span>
              </div>
              <CardDescription>
                Real-time alerts sent directly to your {typeof window !== 'undefined' && (window as any)?.Capacitor?.isNativePlatform?.() ? 'iPhone' : 'browser'} for all key business events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {PUSH_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div key={cat.key} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{cat.label}</p>
                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                      </div>
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    </div>
                  );
                })}
              </div>

              {!isRegistered && isSupported && (
                typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied' ? (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-center space-y-1">
                    <p className="text-sm font-medium text-destructive">Notifications Blocked</p>
                    <p className="text-xs text-muted-foreground">
                      Your browser has blocked notifications. To enable them, click the lock icon in your browser's address bar → Site settings → Allow Notifications, then refresh this page.
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={requestPermission}
                    disabled={isRegistering}
                    className="w-full mt-4 gap-2"
                    variant="outline"
                  >
                    {isRegistering ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    {isRegistering ? 'Enabling...' : 'Enable Notifications'}
                  </Button>
                )
              )}

              {!isSupported && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Push notifications are not supported in this browser. Try using Chrome, Edge, or the native app.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Email & SMS Triggers */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Email & SMS Triggers
              </CardTitle>
              <CardDescription>Control which events also send email or SMS alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Booking Email</Label>
                  <p className="text-sm text-muted-foreground">Email alert when a new booking is made</p>
                </div>
                <Switch
                  checked={settings.notify_new_booking}
                  onCheckedChange={() => handleToggle('notify_new_booking')}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Cancellation Alerts</Label>
                  <p className="text-sm text-muted-foreground">Alert when a booking is cancelled</p>
                </div>
                <Switch
                  checked={settings.notify_cancellations}
                  onCheckedChange={() => handleToggle('notify_cancellations')}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Booking Reminders</Label>
                  <p className="text-sm text-muted-foreground">Send reminder notifications before appointments</p>
                </div>
                <Switch
                  checked={settings.notify_reminders}
                  onCheckedChange={() => handleToggle('notify_reminders')}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive SMS alerts for bookings and cancellations</p>
                </div>
                <Switch
                  checked={settings.notify_sms}
                  onCheckedChange={() => handleToggle('notify_sms')}
                />
              </div>
            </CardContent>
          </Card>

          {/* End of Day Report */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                End of Day Report
              </CardTitle>
              <CardDescription>
                Daily email summary of completed jobs, revenue, unpaid invoices, and tomorrow's preview — sent at 7:00 PM Eastern
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Send End of Day Report Now</Label>
                  <p className="text-sm text-muted-foreground">
                    Trigger a test email with today's end-of-day summary
                  </p>
                </div>
                <Button onClick={handleSendEvening} disabled={sendingEvening} variant="outline" className="gap-2">
                  {sendingEvening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {sendingEvening ? 'Sending...' : 'Run Now'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Morning Brief */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-primary" />
                Morning Brief
              </CardTitle>
              <CardDescription>
                Daily email summary of today's jobs, open estimates, and new requests — sent at 8:00 AM Eastern
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Send Morning Brief Now</Label>
                  <p className="text-sm text-muted-foreground">
                    Trigger a test email with today's summary
                  </p>
                </div>
                <Button onClick={handleSendBrief} disabled={sendingBrief} variant="outline" className="gap-2">
                  {sendingBrief ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {sendingBrief ? 'Sending...' : 'Run Now'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
