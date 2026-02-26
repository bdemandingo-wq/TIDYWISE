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
import { Save, Globe, Bell, Lock, Palette, Loader2, Star, Upload, Eye, EyeOff, AlertCircle, MessageSquare, DollarSign, LayoutGrid, PanelLeft, RotateCcw, Share2, Copy, Code, ExternalLink, Trash2, AlertTriangle, Gift } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from '@/lib/supabase';
import { SignedImage } from '@/components/ui/signed-image';
import { toast } from 'sonner';
import { SMSSettingsCard } from '@/components/admin/SMSSettingsCard';
import { OpenPhoneDebugTools } from '@/components/admin/OpenPhoneDebugTools';
import { PricingSettingsCard } from '@/components/admin/PricingSettingsCard';
import { FormDisplaySettings } from '@/components/admin/FormDisplaySettings';
import { SidebarVisibilitySettings } from '@/components/admin/SidebarVisibilitySettings';
import { MobileBottomNavSettings } from '@/components/admin/MobileBottomNavSettings';
import { BookingFormShareCard } from '@/components/admin/BookingFormShareCard';
import { LoyaltyTierEditor } from '@/components/admin/LoyaltyTierEditor';

import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
  review_sms_template: string;
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
  review_sms_template: 'Hi {customer_name}, thank you for choosing {company_name}! We\'d love to hear about your experience. Please take a moment to leave us a review: {review_link}',
  resend_api_key: '',
};

// Account Deletion Card Component - Required for App Store compliance (Guideline 5.1.1(v))
function AccountDeletionCard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user?.email) return;
    
    if (confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
      toast.error('Email does not match. Please enter your email correctly.');
      return;
    }

    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-my-account', {
        body: { confirmEmail }
      });

      if (error) throw error;

      toast.success('Your account has been permanently deleted.');
      await signOut();
      navigate('/');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast.error(error.message || 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
      setDialogOpen(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="w-5 h-5" />
          Delete Account
        </CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive mb-1">Warning: This action cannot be undone</p>
            <p className="text-muted-foreground">
              Deleting your account will permanently remove all your data including:
            </p>
            <ul className="list-disc list-inside text-muted-foreground mt-2 space-y-1">
              <li>Your business and organization settings</li>
              <li>All customer records and booking history</li>
              <li>Staff members and team assignments</li>
              <li>Invoices, payments, and financial data</li>
              <li>All other associated data</li>
            </ul>
          </div>
        </div>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <Trash2 className="w-4 h-4" />
              Delete My Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Confirm Account Deletion
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p>
                    This will permanently delete your account and all data. This action cannot be reversed.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-email">
                      Type your email <span className="font-medium">{user?.email}</span> to confirm:
                    </Label>
                    <Input
                      id="confirm-email"
                      type="email"
                      placeholder="Enter your email"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      className="border-destructive/50"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmEmail('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={deleting || confirmEmail.toLowerCase() !== user?.email?.toLowerCase()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Yes, Delete My Account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { organization, refetch: refetchOrganization } = useOrganization();
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const { settings: orgSettings, saveSettings: saveOrgSettings } = useOrganizationSettings();
  
  // Get active tab from URL query param, default to "general"
  const activeTab = searchParams.get('tab') || 'general';
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };
  
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
          review_sms_template: typedData.review_sms_template || defaultSettings.review_sms_template,
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
        review_sms_template: settings.review_sms_template,
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

      // Trigger branding re-apply across the CRM
      window.dispatchEvent(new Event('branding-updated'));

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
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `${organization?.id}/logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Store the path (not public URL) for signed URL generation
      // For logos, we'll store the full path including 'booking-photos:' prefix
      // to indicate it's a storage path that needs signed URL
      updateField('logo_url', `storage:booking-photos:${filePath}`);
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/*
          Mobile Safari can aggressively shrink inline-flex children, which can cause tab labels to visually overlap.
          Use an explicit scroll container + non-shrinking triggers so labels stay readable.
        */}
        <div className="w-full max-w-5xl overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
           <TabsList className="w-max min-w-full flex flex-nowrap justify-start gap-1">
            <TabsTrigger className="shrink-0" value="general">General</TabsTrigger>
            <TabsTrigger className="shrink-0" value="booking-form">Booking Form</TabsTrigger>
            <TabsTrigger className="shrink-0" value="pricing">Pricing</TabsTrigger>
            <TabsTrigger className="shrink-0" value="loyalty">Loyalty</TabsTrigger>
            <TabsTrigger className="shrink-0" value="notifications">Notifications</TabsTrigger>
            <TabsTrigger className="shrink-0" value="sms">SMS</TabsTrigger>
            <TabsTrigger className="shrink-0" value="reviews">Reviews</TabsTrigger>
            <TabsTrigger className="shrink-0" value="branding">Branding</TabsTrigger>
            <TabsTrigger className="shrink-0" value="sidebar">Sidebar</TabsTrigger>
            <TabsTrigger className="shrink-0" value="mobile-nav">Mobile Nav</TabsTrigger>
            <TabsTrigger className="shrink-0" value="import">Import Data</TabsTrigger>
            
            <TabsTrigger className="shrink-0" value="security">Security</TabsTrigger>
          </TabsList>
        </div>

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

        {/* Booking Form Sharing */}
        <TabsContent value="booking-form" className="space-y-6">
          <BookingFormShareCard organizationSlug={organization?.slug} />
          <FormDisplaySettings />
        </TabsContent>

        {/* Pricing Settings */}
        <TabsContent value="pricing" className="space-y-6">
          <PricingSettingsCard />
        </TabsContent>

        {/* Loyalty Settings */}
        <TabsContent value="loyalty" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5" />
                Loyalty Program
              </CardTitle>
              <CardDescription>
                Configure your customer loyalty tiers and benefits
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Loyalty Program</p>
                  <p className="text-sm text-muted-foreground">
                    When disabled, customers won't earn points or receive tier-based discounts
                  </p>
                </div>
                <Switch
                  checked={orgSettings?.loyalty_program_enabled ?? true}
                  onCheckedChange={async (checked) => {
                    await saveOrgSettings({ loyalty_program_enabled: checked });
                    toast.success(checked ? 'Loyalty program enabled' : 'Loyalty program disabled');
                  }}
                />
              </div>
              <Separator />
              <p className="text-sm text-muted-foreground">
                Points are earned at $1 = 1 point after each completed booking. Customize the benefits for each tier below.
              </p>
            </CardContent>
          </Card>
          {(orgSettings?.loyalty_program_enabled ?? true) && <LoyaltyTierEditor />}
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


        {/* SMS Settings */}
        <TabsContent value="sms" className="space-y-6">
          <SMSSettingsCard />
          <OpenPhoneDebugTools />
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

              <Separator />

              {/* SMS Template Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="reviewSmsTemplate">Review Request SMS Template</Label>
                </div>
                
                {/* Template Presets */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Quick Templates:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('review_sms_template', 
                        `Hi {customer_name}, love to hear you had a 5-Star experience! Would you be opposed to $10 off your booking? Just click the link I'm sending now: {review_link} - Leave us a 5-Star review within 30 mins and send me a screenshot. I'll take $10 off your total! - {company_name}`
                      )}
                      className="p-3 text-left border rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">💰</span>
                        <span className="font-medium text-sm">$10 Off Method</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Offer $10 discount for a 5-star review with screenshot proof within 30 mins
                      </p>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => updateField('review_sms_template', 
                        `Hi {customer_name}, love to hear you had a 5-Star experience! We're having an office competition - {cleaner_name} is almost in 1st place! It would make their day if you left a 5-Star review: {review_link} - Please mention {cleaner_name} in your review and send us a screenshot! - {company_name}`
                      )}
                      className="p-3 text-left border rounded-lg hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🏆</span>
                        <span className="font-medium text-sm">Office Competition Method</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Frame as team competition to encourage mentioning cleaner by name
                      </p>
                    </button>
                  </div>
                </div>

                <textarea
                  id="reviewSmsTemplate"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Hi {customer_name}, thank you for choosing {company_name}!..."
                  value={settings.review_sms_template}
                  onChange={(e) => updateField('review_sms_template', e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  This message will be sent via SMS when you request a review. Available variables:
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded">{'{customer_name}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{'{company_name}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{'{cleaner_name}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{'{service_name}'}</code>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{'{review_link}'}</code>
                </div>
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
                      <SignedImage 
                        src={settings.logo_url} 
                        alt="Company logo" 
                        className="w-full h-full object-contain"
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
              
              <div className="flex gap-2">
                <Button className="gap-2" onClick={saveSettings} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => {
                    updateField('primary_color', '#3b82f6');
                    updateField('accent_color', '#14b8a6');
                    toast.info('Colors reset to defaults. Click Save to apply.');
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset to Default
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sidebar Settings */}
        <TabsContent value="sidebar" className="space-y-6">
          <SidebarVisibilitySettings />
        </TabsContent>

        {/* Mobile Nav */}
        <TabsContent value="mobile-nav" className="space-y-6">
          <MobileBottomNavSettings />
        </TabsContent>

        {/* Import Data */}
        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Import Data from Another Platform
              </CardTitle>
              <CardDescription>
                Migrate your customers, staff, bookings, and services from BookingKoala or Jobber
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate('/dashboard/import')} className="gap-2">
                <Upload className="w-4 h-4" />
                Open Import Wizard
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

          {/* Account Deletion - Required for App Store compliance */}
          <AccountDeletionCard />
        </TabsContent>

      </Tabs>
    </AdminLayout>
  );
}
