import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Save, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';

interface EmailSettings {
  id?: string;
  from_name: string;
  from_email: string;
  reply_to_email: string;
  email_footer: string;
  resend_api_key: string;
}

const defaultEmailSettings: EmailSettings = {
  from_name: '',
  from_email: '',
  reply_to_email: '',
  email_footer: '',
  resend_api_key: '',
};

export function EmailSettingsCard() {
  const { organization, isAdmin } = useOrganization();
  const [settings, setSettings] = useState<EmailSettings>(defaultEmailSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (organization?.id) {
      fetchEmailSettings();
    }
  }, [organization?.id]);

  const fetchEmailSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('organization_email_settings')
        .select('*')
        .eq('organization_id', organization!.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          from_name: data.from_name || '',
          from_email: data.from_email || '',
          reply_to_email: data.reply_to_email || '',
          email_footer: data.email_footer || '',
          resend_api_key: data.resend_api_key || '',
        });
      }
    } catch (error) {
      console.error('Error fetching email settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const saveEmailSettings = async () => {
    if (!settings.from_name.trim()) {
      toast.error('From Name is required');
      return;
    }
    if (!settings.from_email.trim() || !validateEmail(settings.from_email)) {
      toast.error('Valid From Email is required');
      return;
    }
    if (settings.reply_to_email && !validateEmail(settings.reply_to_email)) {
      toast.error('Reply-To Email must be a valid email address');
      return;
    }

    setSaving(true);
    try {
      const emailData = {
        organization_id: organization!.id,
        from_name: settings.from_name.trim(),
        from_email: settings.from_email.trim(),
        reply_to_email: settings.reply_to_email.trim() || null,
        email_footer: settings.email_footer.trim() || null,
        resend_api_key: settings.resend_api_key.trim() || null,
      };

      if (settings.id) {
        const { error } = await supabase
          .from('organization_email_settings')
          .update(emailData)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('organization_email_settings')
          .insert(emailData)
          .select()
          .single();
        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      toast.success('Email settings saved successfully');
    } catch (error: any) {
      console.error('Error saving email settings:', error);
      toast.error(error.message || 'Failed to save email settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Only organization admins can manage email settings.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Email Sender Settings
        </CardTitle>
        <CardDescription>
          Configure how your organization appears when sending emails to customers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            These settings affect ALL outgoing emails from your organization including booking confirmations, reminders, invoices, and review requests.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fromName">From Name *</Label>
            <Input
              id="fromName"
              placeholder="Your Business Name"
              value={settings.from_name}
              onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              The name customers see when receiving emails
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fromEmail">From Email *</Label>
            <Input
              id="fromEmail"
              type="email"
              placeholder="bookings@yourdomain.com"
              value={settings.from_email}
              onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Must be from a verified domain in Resend
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="replyTo">Reply-To Email (optional)</Label>
          <Input
            id="replyTo"
            type="email"
            placeholder="support@yourdomain.com"
            value={settings.reply_to_email}
            onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Where customer replies will go. Defaults to From Email if empty.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emailFooter">Email Footer (optional)</Label>
          <Textarea
            id="emailFooter"
            placeholder="Your Company Inc. | 123 Main St, City, State 12345"
            value={settings.email_footer}
            onChange={(e) => setSettings({ ...settings, email_footer: e.target.value })}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Added to the bottom of all emails. Great for address, disclaimers, etc.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resendApiKey">Resend API Key (optional)</Label>
          <Input
            id="resendApiKey"
            type="password"
            placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={settings.resend_api_key}
            onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Your organization's own Resend API key. Get one at{' '}
            <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline text-primary">
              resend.com/api-keys
            </a>
            . The domain in your "From Email" must be verified in this Resend account.
          </p>
        </div>

        <Button onClick={saveEmailSettings} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Email Settings
        </Button>
      </CardContent>
    </Card>
  );
}
