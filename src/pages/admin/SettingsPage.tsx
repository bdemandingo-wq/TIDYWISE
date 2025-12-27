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
import { Save, Globe, Bell, Lock, Palette, Loader2, Mail, Star, Upload, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmailTemplatesSettings } from '@/components/admin/EmailTemplatesSettings';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';

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
  // Email integration
  resend_api_key: string;
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
  primary_color: '#3b82f6',
  accent_color: '#14b8a6',
  confirmation_email_subject: 'Your Booking Confirmation - {{booking_number}}',
  confirmation_email_body: 'Hi {{customer_name}},\n\nThank you for booking with us!\n\nYour booking details:\n- Booking #: {{booking_number}}\n- Service: {{service_name}}\n- Date: {{scheduled_date}}\n- Time: {{scheduled_time}}\n- Address: {{address}}\n- Total: ${{total_amount}}\n\nWe look forward to serving you!\n\nBest regards,\n{{company_name}}',
  reminder_email_subject: 'Reminder: Your Cleaning is Tomorrow - {{booking_number}}',
  reminder_email_body: 'Hi {{customer_name}},\n\nThis is a friendly reminder that your cleaning is scheduled for tomorrow.\n\nBooking Details:\n- Booking #: {{booking_number}}\n- Service: {{service_name}}\n- Date: {{scheduled_date}}\n- Time: {{scheduled_time}}\n- Address: {{address}}\n\nIf you need to reschedule or have any questions, please contact us.\n\nSee you soon!\n{{company_name}}',
  google_review_url: '',
  resend_api_key: '',
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { organization, refetch: refetchOrganization } = useOrganization();
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!organization?.id) return;
    fetchSettings();
  }, [organization?.id]);

  const fetchSettings = async () => {
    try {
      if (!organization?.id) return;

      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .eq('organization_id', organization.id)
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
          primary_color: data.primary_color || '#3b82f6',
          accent_color: data.accent_color || '#14b8a6',
          confirmation_email_subject: typedData.confirmation_email_subject || defaultSettings.confirmation_email_subject,
          confirmation_email_body: typedData.confirmation_email_body || defaultSettings.confirmation_email_body,
          reminder_email_subject: typedData.reminder_email_subject || defaultSettings.reminder_email_subject,
          reminder_email_body: typedData.reminder_email_body || defaultSettings.reminder_email_body,
          google_review_url: typedData.google_review_url || '',
          resend_api_key: typedData.resend_api_key || '',
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
        primary_color: settings.primary_color,
        accent_color: settings.accent_color,
        confirmation_email_subject: settings.confirmation_email_subject,
        confirmation_email_body: settings.confirmation_email_body,
        reminder_email_subject: settings.reminder_email_subject,
        reminder_email_body: settings.reminder_email_body,
        google_review_url: settings.google_review_url,
        resend_api_key: settings.resend_api_key,
      } as any;

      if (!organization?.id) {
        throw new Error('No organization found');
      }

      // Upsert: try update first, then insert if no row exists
      if (settings.id) {
        const { error } = await supabase
          .from('business_settings')
          .update(settingsData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Use upsert with unique organization_id constraint
        const { data, error } = await supabase
          .from('business_settings')
          .upsert(
            { ...settingsData, organization_id: organization.id },
            { onConflict: 'organization_id', ignoreDuplicates: false }
          )
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      // If logo changed, update organization too
      if (settings.logo_url && organization?.id) {
        await supabase
          .from('organizations')
          .update({ logo_url: settings.logo_url })
          .eq('id', organization.id);
        refetchOrganization();
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

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${organization?.id || 'default'}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('booking-photos')
        .getPublicUrl(filePath);

      updateField('logo_url', publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(error.message || 'Failed to update password');
    } finally {
      setUpdatingPassword(false);
    }
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
        <TabsList className="grid w-full max-w-3xl grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
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
            <CardContent className="space-y-6">
              {/* Current Status */}
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm font-medium mb-1">Current Sender Email</p>
                <p className="text-lg font-semibold text-primary">
                  {settings.company_email || 'Not configured (using default)'}
                </p>
                {!settings.company_email && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Emails are currently sent from our default address. Set up your own domain below.
                  </p>
                )}
              </div>

              {/* Setup Instructions */}
              <div className="p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-base text-amber-800 dark:text-amber-200 font-semibold mb-3">
                  📧 How to Send Emails from Your Own Domain
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                  To have emails appear from your business (e.g., <strong>bookings@yourcompany.com</strong>), 
                  you need to verify domain ownership. This is an industry security requirement to prevent spam.
                </p>
                
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-sm font-bold text-amber-800 dark:text-amber-200">1</div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Create a Resend Account</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Go to <a href="https://resend.com/signup" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com/signup</a> and 
                        create a free account (10,000 emails/month free).
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-sm font-bold text-amber-800 dark:text-amber-200">2</div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Add Your Domain</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Go to <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium">resend.com/domains</a> → 
                        Click "Add Domain" → Enter your domain (e.g., yourcompany.com)
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-sm font-bold text-amber-800 dark:text-amber-200">3</div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Copy DNS Records</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Resend will show you 3-4 DNS records (TXT and MX records). Copy each one.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-sm font-bold text-amber-800 dark:text-amber-200">4</div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Add Records to Your Domain</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Log into where you bought your domain (GoDaddy, Namecheap, Google Domains, Squarespace, etc.) → 
                        Go to DNS settings → Add the records Resend gave you.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-sm font-bold text-amber-800 dark:text-amber-200">5</div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Wait for Verification</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Click "Verify" in Resend. It usually takes 5-30 minutes. You'll see a green ✓ when verified.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-sm font-bold text-green-800 dark:text-green-200">✓</div>
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Enter Your Email Below</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Once verified, enter any email using that domain below (e.g., bookings@yourcompany.com, 
                        hello@yourcompany.com). All customer emails will now come from this address!
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resend API Key */}
              <div className="space-y-2">
                <Label htmlFor="resendApiKey" className="text-base font-medium">Resend API Key</Label>
                <Input
                  id="resendApiKey"
                  type="password"
                  value={settings.resend_api_key}
                  onChange={(e) => updateField('resend_api_key', e.target.value)}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="h-12 text-base font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  Get your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">resend.com/api-keys</a>. 
                  This is required to send emails from your account.
                </p>
              </div>

              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="senderEmail" className="text-base font-medium">Your Sender Email Address</Label>
                <Input
                  id="senderEmail"
                  type="email"
                  value={settings.company_email}
                  onChange={(e) => updateField('company_email', e.target.value)}
                  placeholder="bookings@yourcompany.com"
                  className="h-12 text-base"
                />
                <p className="text-sm text-muted-foreground">
                  This email appears as the "From" address on booking confirmations, reminders, review requests, and all other customer emails.
                  Customers can reply directly to this address.
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
            companyName={settings.company_name}
            logoUrl={settings.logo_url}
            primaryColor={settings.primary_color}
            accentColor={settings.accent_color}
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
              
              {/* Feedback note */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      What happens with ratings under 4 stars?
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                      Ratings of 3 stars or below will be sent to your <strong>Feedback</strong> tab instead of Google. 
                      This allows you to address customer concerns privately before they become public reviews.
                    </p>
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
            <CardContent className="space-y-6">
              {/* Logo Upload */}
              <div className="space-y-3">
                <Label>Company Logo</Label>
                <div className="flex items-center gap-4">
                  {settings.logo_url ? (
                    <div className="w-20 h-20 rounded-lg border bg-background overflow-hidden flex items-center justify-center">
                      <img 
                        src={settings.logo_url} 
                        alt="Company logo" 
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border bg-muted flex items-center justify-center">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                    />
                    <Label htmlFor="logo-upload" className="cursor-pointer">
                      <Button variant="outline" className="gap-2" asChild disabled={uploadingLogo}>
                        <span>
                          {uploadingLogo ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              Upload Logo
                            </>
                          )}
                        </span>
                      </Button>
                    </Label>
                    <p className="text-sm text-muted-foreground mt-2">
                      PNG, JPG up to 2MB. This logo will appear in your sidebar.
                    </p>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {/* Color Pickers */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label>Primary Color</Label>
                  <div className="flex gap-3">
                    <Input
                      type="color"
                      value={settings.primary_color}
                      onChange={(e) => updateField('primary_color', e.target.value)}
                      className="w-14 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={settings.primary_color}
                      onChange={(e) => updateField('primary_color', e.target.value)}
                      placeholder="#3b82f6"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for buttons and key actions</p>
                </div>
                <div className="space-y-3">
                  <Label>Accent Color</Label>
                  <div className="flex gap-3">
                    <Input
                      type="color"
                      value={settings.accent_color}
                      onChange={(e) => updateField('accent_color', e.target.value)}
                      className="w-14 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={settings.accent_color}
                      onChange={(e) => updateField('accent_color', e.target.value)}
                      placeholder="#14b8a6"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for highlights and secondary elements</p>
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
                Change Password
              </CardTitle>
              <CardDescription>
                Update your account password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input 
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <div className="relative">
                    <Input 
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <Button 
                className="gap-2" 
                onClick={handlePasswordUpdate}
                disabled={updatingPassword || !newPassword || !confirmPassword}
              >
                {updatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
