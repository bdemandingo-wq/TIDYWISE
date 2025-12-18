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
import { Save, Globe, Bell, Lock, Palette, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
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
      };

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

  const updateField = (field: keyof BusinessSettings, value: string | number) => {
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
        <TabsList className="grid w-full max-w-xl grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="booking">Booking</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
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
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Require Deposit</p>
                  <p className="text-sm text-muted-foreground">
                    Collect a deposit when booking is made
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Notice (hours)</Label>
                  <Input type="number" defaultValue="24" />
                </div>
                <div className="space-y-2">
                  <Label>Cancellation Window (hours)</Label>
                  <Input type="number" defaultValue="48" />
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
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Booking Reminders</p>
                  <p className="text-sm text-muted-foreground">Send reminders to customers before their appointment</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Cancellation Alerts</p>
                  <p className="text-sm text-muted-foreground">Get notified when a booking is cancelled</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">SMS Notifications</p>
                  <p className="text-sm text-muted-foreground">Receive SMS for urgent updates</p>
                </div>
                <Switch />
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
                    <Input defaultValue="#3b82f6" />
                    <div className="w-10 h-10 rounded-lg bg-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <Input defaultValue="#14b8a6" />
                    <div className="w-10 h-10 rounded-lg bg-accent" />
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
