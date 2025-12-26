import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, Globe, Bell, Lock, Palette, Loader2, Mail, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmailTemplatesSettings } from '@/components/admin/EmailTemplatesSettings';

interface BusinessSettings {
  id?: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  timezone: string;
  currency: string;
  logo_url: string;
  booking_buffer_minutes: number;
  max_advance_booking_days: number;
  cancellation_policy: string;
  // Booking settings
  allow_online_booking: boolean;
  require_deposit: boolean;
  minimum_notice_hours: number;
  cancellation_window_hours: number;
  // Notification settings
  notify_new_booking: boolean;
  notify_reminders: boolean;
  notify_cancellations: boolean;
  notify_sms: boolean;
  // Branding settings
  primary_color: string;
  accent_color: string;
  // Email templates
  confirmation_email_subject: string;
  confirmation_email_body: string;
  reminder_email_subject: string;
  reminder_email_body: string;
  // Reviews
  google_review_url: string;
}

const defaultSettings: BusinessSettings = {
  company_name: '',
  company_email: '',
  company_phone: '',
  company_address: '',
  company_city: '',
  company_state: '',
  company_zip: '',
  timezone: 'America/New_York',
  currency: 'USD',
  logo_url: '',
  booking_buffer_minutes: 15,
  max_advance_booking_days: 60,
  cancellation_policy: '',
  allow_online_booking: true,
  require_deposit: true,
  minimum_notice_hours: 24,
  cancellation_window_hours: 48,
  notify_new_booking: true,
  notify_reminders: true,
  notify_cancellations: true,
  notify_sms: false,
  primary_color: '#3b82f6',
  accent_color: '#14b8a6',
  confirmation_email_subject: 'Your Booking Confirmation - {{booking_number}}',
  confirmation_email_body: 'Hi {{customer_name}},\n\nThank you for booking with us!\n\nYour booking details:\n- Booking #: {{booking_number}}\n- Service: {{service_name}}\n- Date: {{scheduled_date}}\n- Time: {{scheduled_time}}\n- Address: {{address}}\n- Total: ${{total_amount}}\n\nWe look forward to serving you!\n\nBest regards,\n{{company_name}}',
  reminder_email_subject: 'Reminder: Your Cleaning is Tomorrow - {{booking_number}}',
  reminder_email_body: 'Hi {{customer_name}},\n\nThis is a friendly reminder that your cleaning is scheduled for tomorrow.\n\nBooking Details:\n- Booking #: {{booking_number}}\n- Service: {{service_name}}\n- Date: {{scheduled_date}}\n- Time: {{scheduled_time}}\n- Address: {{address}}\n\nIf you need to reschedule or have any questions, please contact us.\n\nSee you soon!\n{{company_name}}',
  google_review_url: '',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const typedData = data as any;
        setSettings({
          id: data.id,
          company_name: data.company_name || '',
          company_email: data.company_email || '',
          company_phone: data.company_phone || '',
          company_address: data.company_address || '',
          company_city: data.company_city || '',
          company_state: data.company_state || '',
          company_zip: data.company_zip || '',
          timezone: data.timezone || 'America/New_York',
          currency: data.currency || 'USD',
          logo_url: data.logo_url || '',
          booking_buffer_minutes: data.booking_buffer_minutes || 15,
          max_advance_booking_days: data.max_advance_booking_days || 60,
          cancellation_policy: data.cancellation_policy || '',
          allow_online_booking: data.allow_online_booking ?? true,
          require_deposit: data.require_deposit ?? true,
          minimum_notice_hours: data.minimum_notice_hours || 24,
          cancellation_window_hours: data.cancellation_window_hours || 48,
          notify_new_booking: data.notify_new_booking ?? true,
          notify_reminders: data.notify_reminders ?? true,
          notify_cancellations: data.notify_cancellations ?? true,
          notify_sms: data.notify_sms ?? false,
          primary_color: data.primary_color || '#3b82f6',
          accent_color: data.accent_color || '#14b8a6',
          confirmation_email_subject: typedData.confirmation_email_subject || defaultSettings.confirmation_email_subject,
          confirmation_email_body: typedData.confirmation_email_body || defaultSettings.confirmation_email_body,
          reminder_email_subject: typedData.reminder_email_subject || defaultSettings.reminder_email_subject,
          reminder_email_body: typedData.reminder_email_body || defaultSettings.reminder_email_body,
          google_review_url: typedData.google_review_url || '',
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const settingsData = {
        company_name: settings.company_name,
        company_email: settings.company_email,
        company_phone: settings.company_phone,
        company_address: settings.company_address,
        company_city: settings.company_city,
        company_state: settings.company_state,
        company_zip: settings.company_zip,
        timezone: settings.timezone,
        currency: settings.currency,
        logo_url: settings.logo_url,
        booking_buffer_minutes: settings.booking_buffer_minutes,
        max_advance_booking_days: settings.max_advance_booking_days,
        cancellation_policy: settings.cancellation_policy,
        allow_online_booking: settings.allow_online_booking,
        require_deposit: settings.require_deposit,
        minimum_notice_hours: settings.minimum_notice_hours,
        cancellation_window_hours: settings.cancellation_window_hours,
        notify_new_booking: settings.notify_new_booking,
        notify_reminders: settings.notify_reminders,
        notify_cancellations: settings.notify_cancellations,
        notify_sms: settings.notify_sms,
        primary_color: settings.primary_color,
        accent_color: settings.accent_color,
        confirmation_email_subject: settings.confirmation_email_subject,
        confirmation_email_body: settings.confirmation_email_body,
        reminder_email_subject: settings.reminder_email_subject,
        reminder_email_body: settings.reminder_email_body,
        google_review_url: settings.google_review_url,
      } as any;

      if (settings.id) {
        const { error } = await supabase
          .from('business_settings')
          .update(settingsData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('business_settings')
          .insert(settingsData)
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BusinessSettings, value: string | number | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <AdminLayout title="Settings" subtitle="Manage your business preferences">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Settings"
      subtitle="Manage your business preferences"
    >
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full max-w-4xl grid-cols-7">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="booking">Booking</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Business Information
              </CardTitle>
              <CardDescription>
                Update your business details and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    value={settings.company_name}
                    onChange={(e) => updateField('company_name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Business Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.company_email}
                    onChange={(e) => updateField('company_email', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={settings.company_phone}
                    onChange={(e) => updateField('company_phone', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={settings.company_city}
                    onChange={(e) => updateField('company_city', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Business Address</Label>
                <Input
                  id="address"
                  value={settings.company_address}
                  onChange={(e) => updateField('company_address', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={settings.company_state}
                    onChange={(e) => updateField('company_state', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP Code</Label>
                  <Input
                    id="zip"
                    value={settings.company_zip}
                    onChange={(e) => updateField('company_zip', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={settings.timezone}
                    onValueChange={(value) => updateField('timezone', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={settings.currency}
                    onValueChange={(value) => updateField('currency', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Booking Settings */}
        <TabsContent value="booking" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Booking Preferences</CardTitle>
              <CardDescription>
                Configure how customers can book your services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Allow Online Booking</p>
                  <p className="text-sm text-muted-foreground">
                    Let customers book services through your website
                  </p>
                </div>
                <Switch
                  checked={settings.allow_online_booking}
                  onCheckedChange={(checked) => updateField('allow_online_booking', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Require Deposit</p>
                  <p className="text-sm text-muted-foreground">
                    Collect a deposit when booking is made
                  </p>
                </div>
                <Switch
                  checked={settings.require_deposit}
                  onCheckedChange={(checked) => updateField('require_deposit', checked)}
                />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Notice (hours)</Label>
                  <Input
                    type="number"
                    value={settings.minimum_notice_hours}
                    onChange={(e) => updateField('minimum_notice_hours', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cancellation Window (hours)</Label>
                  <Input
                    type="number"
                    value={settings.cancellation_window_hours}
                    onChange={(e) => updateField('cancellation_window_hours', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Buffer Between Bookings (min)</Label>
                  <Input
                    type="number"
                    value={settings.booking_buffer_minutes}
                    onChange={(e) => updateField('booking_buffer_minutes', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Advance Booking (days)</Label>
                  <Input
                    type="number"
                    value={settings.max_advance_booking_days}
                    onChange={(e) => updateField('max_advance_booking_days', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Choose how you want to receive updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">New Booking Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when a new booking is made</p>
                </div>
                <Switch
                  checked={settings.notify_new_booking}
                  onCheckedChange={(checked) => updateField('notify_new_booking', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Booking Reminders</p>
                  <p className="text-sm text-muted-foreground">Send reminders to customers before their appointment</p>
                </div>
                <Switch
                  checked={settings.notify_reminders}
                  onCheckedChange={(checked) => updateField('notify_reminders', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Cancellation Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when a booking is cancelled</p>
                </div>
                <Switch
                  checked={settings.notify_cancellations}
                  onCheckedChange={(checked) => updateField('notify_cancellations', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">SMS Notifications</p>
                  <p className="text-sm text-muted-foreground">Receive SMS for urgent updates</p>
                </div>
                <Switch
                  checked={settings.notify_sms}
                  onCheckedChange={(checked) => updateField('notify_sms', checked)}
                />
              </div>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Templates */}
        <TabsContent value="emails" className="space-y-6">
          {/* Email Sender Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Email Sender Settings
              </CardTitle>
              <CardDescription>
                Configure the email address that customers will see when receiving emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">
                  Important: Custom Email Domain Setup
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                  To send emails from your own domain (e.g., hello@yourbusiness.com), you need to verify your domain:
                </p>
                <ol className="text-sm text-amber-700 dark:text-amber-300 list-decimal list-inside space-y-1">
                  <li>Go to <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com/domains</a></li>
                  <li>Add your domain and copy the DNS records</li>
                  <li>Add the DNS records to your domain provider (GoDaddy, Namecheap, etc.)</li>
                  <li>Wait for verification (usually 5-30 minutes)</li>
                  <li>Once verified, enter your email below</li>
                </ol>
              </div>
              <div className="space-y-2">
                <Label htmlFor="senderEmail">Sender Email Address</Label>
                <Input
                  id="senderEmail"
                  type="email"
                  value={settings.company_email}
                  onChange={(e) => updateField('company_email', e.target.value)}
                  placeholder="hello@yourbusiness.com"
                />
                <p className="text-xs text-muted-foreground">
                  This email will appear as the "From" address on all emails sent to customers. Must be from a verified domain.
                </p>
              </div>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
          
          <EmailTemplatesSettings
            confirmationEmailSubject={settings.confirmation_email_subject}
            confirmationEmailBody={settings.confirmation_email_body}
            reminderEmailSubject={settings.reminder_email_subject}
            reminderEmailBody={settings.reminder_email_body}
            onUpdate={(field, value) => updateField(field as keyof BusinessSettings, value)}
            onSave={saveSettings}
            saving={saving}
          />
        </TabsContent>

        {/* Reviews Settings */}
        <TabsContent value="reviews" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5" />
                Review Settings
              </CardTitle>
              <CardDescription>
                Configure your Google review settings for customer feedback
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="googleReviewUrl">Google Review URL</Label>
                <Input
                  id="googleReviewUrl"
                  placeholder="https://g.page/r/your-business/review"
                  value={settings.google_review_url}
                  onChange={(e) => updateField('google_review_url', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  When customers rate 4+ stars, they'll be prompted to leave a review on Google.
                  Get your link from Google Business Profile.
                </p>
              </div>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding */}
        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Brand Customization
              </CardTitle>
              <CardDescription>
                Customize the look and feel of your booking page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input
                  value={settings.logo_url}
                  onChange={(e) => updateField('logo_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.primary_color}
                      onChange={(e) => updateField('primary_color', e.target.value)}
                    />
                    <div
                      className="w-10 h-10 rounded-lg border"
                      style={{ backgroundColor: settings.primary_color }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.accent_color}
                      onChange={(e) => updateField('accent_color', e.target.value)}
                    />
                    <div
                      className="w-10 h-10 rounded-lg border"
                      style={{ backgroundColor: settings.accent_color }}
                    />
                  </div>
                </div>
              </div>
              <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Manage your account security preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input type="password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" />
                </div>
              </div>
              <Button className="gap-2">
                <Save className="w-4 h-4" />
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
