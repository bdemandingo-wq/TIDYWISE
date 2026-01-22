import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Bell, MessageSquare, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const [settings, setSettings] = useState({
    emailNewBooking: true,
    emailCancellation: true,
    emailReminder: true,
    emailDailyDigest: false,
    smsNewBooking: false,
    smsCancellation: true,
    smsReminder: true,
    pushEnabled: true,
  });

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    toast.success('Notification settings saved!');
  };

  return (
    <AdminLayout
      title="Notifications"
      subtitle="Manage how you receive notifications"
    >
      {/* SMS Notifications */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            SMS Notifications
          </CardTitle>
          <CardDescription>Configure which SMS messages you want to receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>New Booking</Label>
              <p className="text-sm text-muted-foreground">Get notified when a new booking is made</p>
            </div>
            <Switch 
              checked={settings.emailNewBooking} 
              onCheckedChange={() => handleToggle('emailNewBooking')} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Cancellations</Label>
              <p className="text-sm text-muted-foreground">Get notified when a booking is cancelled</p>
            </div>
            <Switch 
              checked={settings.emailCancellation} 
              onCheckedChange={() => handleToggle('emailCancellation')} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Booking Reminders</Label>
              <p className="text-sm text-muted-foreground">Send reminder emails before appointments</p>
            </div>
            <Switch 
              checked={settings.emailReminder} 
              onCheckedChange={() => handleToggle('emailReminder')} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Daily Digest</Label>
              <p className="text-sm text-muted-foreground">Receive a daily summary of bookings</p>
            </div>
            <Switch 
              checked={settings.emailDailyDigest} 
              onCheckedChange={() => handleToggle('emailDailyDigest')} 
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
              <Label>New Booking SMS</Label>
              <p className="text-sm text-muted-foreground">Text alerts for new bookings</p>
            </div>
            <Switch 
              checked={settings.smsNewBooking} 
              onCheckedChange={() => handleToggle('smsNewBooking')} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Cancellation SMS</Label>
              <p className="text-sm text-muted-foreground">Text alerts for cancellations</p>
            </div>
            <Switch 
              checked={settings.smsCancellation} 
              onCheckedChange={() => handleToggle('smsCancellation')} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Reminder SMS</Label>
              <p className="text-sm text-muted-foreground">Send SMS reminders to customers</p>
            </div>
            <Switch 
              checked={settings.smsReminder} 
              onCheckedChange={() => handleToggle('smsReminder')} 
            />
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Push Notifications
          </CardTitle>
          <CardDescription>Browser and mobile push notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Push Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive real-time notifications in your browser</p>
            </div>
            <Switch 
              checked={settings.pushEnabled} 
              onCheckedChange={() => handleToggle('pushEnabled')} 
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Changes</Button>
      </div>
    </AdminLayout>
  );
}
