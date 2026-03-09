import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Bell, MessageSquare, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function NotificationsPage() {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings from business_settings table
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

  return (
    <AdminLayout
      title="Notifications"
      subtitle="Manage how you receive notifications"
    >
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
          {/* Booking Notifications */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Booking Notifications
              </CardTitle>
              <CardDescription>Configure which notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New Booking</Label>
                  <p className="text-sm text-muted-foreground">Get notified when a new booking is made</p>
                </div>
                <Switch 
                  checked={settings.notify_new_booking} 
                  onCheckedChange={() => handleToggle('notify_new_booking')} 
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Cancellations</Label>
                  <p className="text-sm text-muted-foreground">Get notified when a booking is cancelled</p>
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
            </CardContent>
          </Card>

          {/* SMS Notifications */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                SMS Notifications
              </CardTitle>
              <CardDescription>Configure text message notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive SMS alerts for bookings and cancellations</p>
                </div>
                <Switch 
                  checked={settings.notify_sms} 
                  onCheckedChange={() => handleToggle('notify_sms')} 
                />
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
