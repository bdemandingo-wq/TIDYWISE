import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MessageSquare, ExternalLink, CheckCircle2, Save, Loader2, Eye, EyeOff, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface SMSSettings {
  id?: string;
  openphone_api_key: string;
  openphone_phone_number_id: string;
  sms_enabled: boolean;
  sms_booking_confirmation: boolean;
  sms_appointment_reminder: boolean;
  reminder_hours_before: number;
}

const defaultSettings: SMSSettings = {
  openphone_api_key: '',
  openphone_phone_number_id: '',
  sms_enabled: false,
  sms_booking_confirmation: true,
  sms_appointment_reminder: true,
  reminder_hours_before: 24,
};

export function SMSSettingsCard() {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<SMSSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (organization?.id) {
      fetchSettings();
    }
  }, [organization?.id]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('organization_sms_settings')
        .select('*')
        .eq('organization_id', organization!.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          openphone_api_key: data.openphone_api_key || '',
          openphone_phone_number_id: data.openphone_phone_number_id || '',
          sms_enabled: data.sms_enabled || false,
          sms_booking_confirmation: data.sms_booking_confirmation ?? true,
          sms_appointment_reminder: data.sms_appointment_reminder ?? true,
          reminder_hours_before: data.reminder_hours_before || 24,
        });
      }
    } catch (error) {
      console.error('Error fetching SMS settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Extract phone number ID from full URL if pasted
  const extractPhoneNumberId = (input: string): string => {
    // If it's a full URL like https://my.openphone.com/settings/phone-numbers/PNr7XukuaV
    const urlMatch = input.match(/phone-numbers\/(PN[a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    
    // If it already looks like an ID (starts with PN)
    if (input.startsWith('PN')) return input;
    
    // Otherwise return as-is
    return input;
  };

  const saveSettings = async () => {
    if (!organization?.id) return;

    setSaving(true);
    try {
      // Extract/normalize values in case user pasted full URL or included prefix/whitespace
      const cleanPhoneNumberId = extractPhoneNumberId(settings.openphone_phone_number_id);
      const cleanApiKey = settings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');

      const settingsData = {
        organization_id: organization.id,
        openphone_api_key: cleanApiKey,
        openphone_phone_number_id: cleanPhoneNumberId,
        sms_enabled: settings.sms_enabled,
        sms_booking_confirmation: settings.sms_booking_confirmation,
        sms_appointment_reminder: settings.sms_appointment_reminder,
        reminder_hours_before: settings.reminder_hours_before,
      };

      if (settings.id) {
        const { error } = await supabase
          .from('organization_sms_settings')
          .update(settingsData)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('organization_sms_settings')
          .insert(settingsData)
          .select()
          .single();
        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      // Update local state with cleaned values
      setSettings(prev => ({ ...prev, openphone_phone_number_id: cleanPhoneNumberId, openphone_api_key: cleanApiKey }));
      toast.success('SMS settings saved successfully');
    } catch (error) {
      console.error('Error saving SMS settings:', error);
      toast.error('Failed to save SMS settings');
    } finally {
      setSaving(false);
    }
  };

  const testSMS = async () => {
    if (!testPhone) {
      toast.error('Please enter a phone number to test');
      return;
    }

    if (!settings.openphone_api_key || !settings.openphone_phone_number_id) {
      toast.error('Please configure your OpenPhone API Key and Phone Number ID first');
      return;
    }

    if (!settings.sms_enabled) {
      toast.error('Please enable SMS notifications and save settings first');
      return;
    }

    // Save settings first to ensure the database is up to date
    if (!settings.id) {
      toast.error('Please save your settings before testing');
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-openphone-sms', {
        body: {
          to: testPhone,
          message: `Test SMS from ${organization?.name || 'your business'}. Your SMS integration is working correctly!`,
          organizationId: organization?.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Test SMS sent successfully!');
      } else {
        throw new Error(data?.error || 'Failed to send test SMS');
      }
    } catch (error: any) {
      console.error('Error sending test SMS:', error);
      toast.error(error.message || 'Failed to send test SMS');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            SMS Notifications (OpenPhone)
            {settings.sms_enabled ? (
              <Badge variant="default" className="ml-2 bg-green-500">Active</Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">Disabled</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Send automatic SMS notifications to customers for booking confirmations and reminders
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable SMS */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base font-medium">Enable SMS Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Turn on SMS notifications for your customers
              </p>
            </div>
            <Switch
              checked={settings.sms_enabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sms_enabled: checked }))}
            />
          </div>

          {/* API Configuration */}
          <div className="space-y-4">
            <h4 className="font-semibold">OpenPhone API Configuration</h4>
            
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.openphone_api_key}
                  onChange={(e) => setSettings(prev => ({ ...prev, openphone_api_key: e.target.value }))}
                  placeholder="Enter your OpenPhone API key"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                value={settings.openphone_phone_number_id}
                onChange={(e) => setSettings(prev => ({ ...prev, openphone_phone_number_id: e.target.value }))}
                placeholder="e.g., PNr7XukuaV (not the full URL)"
              />
              <p className="text-xs text-muted-foreground">
                Just the ID (starts with PN...), not the full URL
              </p>
            </div>
          </div>

          {/* Notification Types */}
          <div className="space-y-4">
            <h4 className="font-semibold">Notification Types</h4>
            
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Booking Confirmations</Label>
                <p className="text-sm text-muted-foreground">
                  Send SMS when a booking is confirmed
                </p>
              </div>
              <Switch
                checked={settings.sms_booking_confirmation}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sms_booking_confirmation: checked }))}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Appointment Reminders</Label>
                <p className="text-sm text-muted-foreground">
                  Send reminder SMS before appointments
                </p>
              </div>
              <Switch
                checked={settings.sms_appointment_reminder}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sms_appointment_reminder: checked }))}
              />
            </div>

            {settings.sms_appointment_reminder && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                <Label htmlFor="reminderHours">Reminder Hours Before</Label>
                <Input
                  id="reminderHours"
                  type="number"
                  min={1}
                  max={72}
                  value={settings.reminder_hours_before}
                  onChange={(e) => setSettings(prev => ({ ...prev, reminder_hours_before: parseInt(e.target.value) || 24 }))}
                  className="w-32"
                />
                <p className="text-sm text-muted-foreground">
                  Hours before appointment to send reminder
                </p>
              </div>
            )}
          </div>

          <Button onClick={saveSettings} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Test SMS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Test SMS
          </CardTitle>
          <CardDescription>
            Send a test message to verify your integration is working
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="testPhone">Phone Number</Label>
              <Input
                id="testPhone"
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={testSMS} 
                disabled={testing || !settings.openphone_api_key || !settings.sms_enabled || !settings.id} 
                className="gap-2"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Test
              </Button>
              {(!settings.sms_enabled || !settings.id) && settings.openphone_api_key && (
                <p className="text-sm text-muted-foreground">
                  Enable SMS and save settings first
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle>How to Get Your OpenPhone Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                1
              </div>
              <div className="space-y-1">
                <p className="font-medium">Create an OpenPhone Account</p>
                <p className="text-sm text-muted-foreground">
                  Go to <a href="https://www.openphone.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    openphone.com <ExternalLink className="w-3 h-3" />
                  </a> and sign up for an account.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                2
              </div>
              <div className="space-y-1">
                <p className="font-medium">Get Your API Key</p>
                <p className="text-sm text-muted-foreground">
                  Go to <strong>Settings → API</strong> and create a new API key.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                3
              </div>
              <div className="space-y-1">
                <p className="font-medium">Find Your Phone Number ID</p>
                <p className="text-sm text-muted-foreground">
                  In OpenPhone, go to <strong>Phone Numbers</strong>, click your number, and find the ID in the URL or settings.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <h4 className="font-semibold mb-3">SMS Notifications Include:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Booking confirmation texts to customers
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Appointment reminders before cleanings
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Schedule change notifications
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
