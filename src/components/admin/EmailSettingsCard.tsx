import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Save, Loader2, AlertTriangle, CheckCircle2, Mail, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';

interface EmailSettings {
  id?: string;
  from_name: string;
  from_email: string;
  reply_to_email: string;
  email_footer: string;
  // Write-only fields — never returned by the API. We only know whether one is configured.
  resend_api_key: string;
  // Gmail SMTP
  email_send_method: 'resend' | 'gmail_smtp';
  gmail_account_type: 'consumer' | 'workspace';
  smtp_email: string;
  smtp_app_password: string;
}

const defaultEmailSettings: EmailSettings = {
  from_name: '',
  from_email: '',
  reply_to_email: '',
  email_footer: '',
  resend_api_key: '',
  email_send_method: 'resend',
  gmail_account_type: 'consumer',
  smtp_email: '',
  smtp_app_password: '',
};

export function EmailSettingsCard() {
  const { organization, isAdmin } = useOrganization();
  const [settings, setSettings] = useState<EmailSettings>(defaultEmailSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasResendKey, setHasResendKey] = useState(false);
  const [hasSmtpPassword, setHasSmtpPassword] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [dailyStats, setDailyStats] = useState<{ gmail: number; resend: number }>({ gmail: 0, resend: 0 });

  useEffect(() => {
    if (organization?.id) {
      fetchEmailSettings();
      fetchDailyStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const fetchEmailSettings = async () => {
    try {
      // Use the safe RPC — never touches secret columns directly.
      const { data: rows, error } = await supabase.rpc('get_org_email_settings_safe' as never, {
        _organization_id: organization!.id,
      } as never);
      if (error) throw error;
      const data = Array.isArray(rows) ? (rows[0] as any) : (rows as any);
      if (data) {
        setSettings({
          id: data.id,
          from_name: data.from_name || '',
          from_email: data.from_email || '',
          reply_to_email: data.reply_to_email || '',
          email_footer: data.email_footer || '',
          resend_api_key: '',
          email_send_method: (data.email_send_method || 'resend') as 'resend' | 'gmail_smtp',
          gmail_account_type: (data.gmail_account_type || 'consumer') as 'consumer' | 'workspace',
          smtp_email: data.smtp_email || '',
          smtp_app_password: '',
        });
        setHasResendKey(Boolean(data.resend_api_key_configured));
        setHasSmtpPassword(Boolean(data.smtp_password_configured));
      }
    } catch (error) {
      console.error('Error fetching email settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyStats = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('org_email_daily_sends' as never)
        .select('method, sent_count')
        .eq('organization_id', organization!.id)
        .eq('sent_on', today);
      const rows = (data as any[]) || [];
      setDailyStats({
        gmail: rows.find((r) => r.method === 'gmail_smtp')?.sent_count ?? 0,
        resend: rows.find((r) => r.method === 'resend')?.sent_count ?? 0,
      });
    } catch (e) {
      console.warn('Could not load daily send stats', e);
    }
  };

  const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const saveEmailSettings = async () => {
    if (!settings.from_name.trim()) return toast.error('From Name is required');
    if (!settings.from_email.trim() || !validateEmail(settings.from_email)) return toast.error('Valid From Email is required');
    if (settings.reply_to_email && !validateEmail(settings.reply_to_email)) return toast.error('Reply-To Email must be a valid email address');
    if (settings.email_send_method === 'gmail_smtp') {
      if (!settings.smtp_email.trim() || !validateEmail(settings.smtp_email)) {
        return toast.error('Enter your Gmail address (works with @gmail.com and Google Workspace).');
      }
      if (!hasSmtpPassword && !settings.smtp_app_password.trim()) {
        return toast.error('Enter your 16-character Gmail app password.');
      }
    }

    setSaving(true);
    try {
      const trimmedKey = settings.resend_api_key.trim();
      const trimmedSmtpPassword = settings.smtp_app_password.trim();
      const baseData: Record<string, unknown> = {
        organization_id: organization!.id,
        from_name: settings.from_name.trim(),
        from_email: settings.from_email.trim(),
        reply_to_email: settings.reply_to_email.trim() || null,
        email_footer: settings.email_footer.trim() || null,
        email_send_method: settings.email_send_method,
        gmail_account_type: settings.gmail_account_type,
        smtp_email: settings.smtp_email.trim() || null,
      };
      if (trimmedKey.length > 0) baseData.resend_api_key = trimmedKey;
      if (trimmedSmtpPassword.length > 0) baseData.smtp_app_password = trimmedSmtpPassword;

      if (settings.id) {
        const { error } = await supabase
          .from('organization_email_settings')
          .update(baseData as never)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('organization_email_settings')
          .insert(baseData as never)
          .select('id')
          .single();
        if (error) throw error;
        setSettings((prev) => ({ ...prev, id: data.id }));
      }

      toast.success('Email settings saved');
      if (trimmedKey.length > 0) {
        setHasResendKey(true);
        setSettings((prev) => ({ ...prev, resend_api_key: '' }));
      }
      if (trimmedSmtpPassword.length > 0) {
        setHasSmtpPassword(true);
        setSettings((prev) => ({ ...prev, smtp_app_password: '' }));
      }
    } catch (error: any) {
      console.error('Error saving email settings:', error);
      toast.error(error.message || 'Failed to save email settings');
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmailTo.trim() || !validateEmail(testEmailTo)) return toast.error('Enter a valid test recipient email');
    if (!hasSmtpPassword && !settings.smtp_app_password.trim()) {
      return toast.error('Save your Gmail credentials first, then send a test.');
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-gmail-test-email', {
        body: { organizationId: organization!.id, to: testEmailTo.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Test email sent from ${(data as any)?.from ?? settings.smtp_email}. Check the inbox.`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send test email');
    } finally {
      setTesting(false);
    }
  };

  const gmailLimit = settings.gmail_account_type === 'workspace' ? 2000 : 500;
  const nearLimit = dailyStats.gmail >= gmailLimit * 0.8;
  const overLimit = dailyStats.gmail >= gmailLimit;

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
            These settings affect ALL outgoing customer emails from your organization: booking confirmations, reminders, invoices, review requests, and campaigns.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fromName">From Name *</Label>
            <Input id="fromName" placeholder="Your Business Name" value={settings.from_name}
              onChange={(e) => setSettings({ ...settings, from_name: e.target.value })} />
            <p className="text-xs text-muted-foreground">The name customers see when receiving emails</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromEmail">From Email *</Label>
            <Input id="fromEmail" type="email" placeholder="bookings@yourdomain.com" value={settings.from_email}
              onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              If using Gmail SMTP below, this should match (or be an alias of) your Gmail address.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="replyTo">Reply-To Email (optional)</Label>
          <Input id="replyTo" type="email" placeholder="support@yourdomain.com" value={settings.reply_to_email}
            onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="emailFooter">Email Footer (optional)</Label>
          <Textarea id="emailFooter" placeholder="Your Company Inc. | 123 Main St, City, State 12345"
            value={settings.email_footer} onChange={(e) => setSettings({ ...settings, email_footer: e.target.value })} rows={3} />
        </div>

        <Separator />

        {/* Send method */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-semibold">How should customer emails be sent?</Label>
            <p className="text-xs text-muted-foreground mt-1">
              System emails (signup, password reset, admin alerts) always send from the platform regardless of this choice.
            </p>
          </div>
          <RadioGroup
            value={settings.email_send_method}
            onValueChange={(v) => setSettings({ ...settings, email_send_method: v as 'resend' | 'gmail_smtp' })}
            className="grid gap-3"
          >
            <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="resend" id="method-resend" className="mt-1" />
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Send via Resend (default)
                </div>
                <p className="text-xs text-muted-foreground">
                  Uses your Resend API key. Requires a verified domain in Resend. Best for high volume.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/40">
              <RadioGroupItem value="gmail_smtp" id="method-gmail" className="mt-1" />
              <div className="space-y-1">
                <div className="font-medium flex items-center gap-2">
                  <Send className="w-4 h-4" /> Send from your own Gmail
                </div>
                <p className="text-xs text-muted-foreground">
                  Emails go out from your real Gmail address (works with @gmail.com and Google Workspace). No domain verification needed. We automatically fall back to Resend if Gmail fails or you hit Google's daily limit.
                </p>
              </div>
            </label>
          </RadioGroup>
        </div>

        {/* Gmail SMTP config */}
        {settings.email_send_method === 'gmail_smtp' && (
          <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
            <div className="flex items-start gap-2">
              <Send className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <div className="font-semibold text-sm">Gmail SMTP</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Requires 2-Step Verification on your Google account. Create an app password at{' '}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline text-primary">
                    myaccount.google.com/apppasswords
                  </a>
                  , choose <strong>Mail</strong>, and paste the 16-character password here. Works with @gmail.com and Google Workspace accounts.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="smtpEmail">Gmail address</Label>
                <Input id="smtpEmail" type="email" placeholder="you@yourdomain.com or you@gmail.com"
                  value={settings.smtp_email}
                  onChange={(e) => setSettings({ ...settings, smtp_email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPassword">
                  App password {hasSmtpPassword && <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> configured</span>}
                </Label>
                <Input id="smtpPassword" type="password" autoComplete="new-password"
                  placeholder={hasSmtpPassword ? '••••••••  (leave blank to keep current)' : 'abcd efgh ijkl mnop'}
                  value={settings.smtp_app_password}
                  onChange={(e) => setSettings({ ...settings, smtp_app_password: e.target.value })} />
                <p className="text-xs text-muted-foreground">Stored encrypted — never displayed again.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Account type</Label>
              <RadioGroup
                value={settings.gmail_account_type}
                onValueChange={(v) => setSettings({ ...settings, gmail_account_type: v as 'consumer' | 'workspace' })}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="consumer" id="acct-consumer" />
                  Personal Gmail (~500/day)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <RadioGroupItem value="workspace" id="acct-workspace" />
                  Google Workspace (~2,000/day)
                </label>
              </RadioGroup>
            </div>

            {/* Daily usage warning */}
            <div className="text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Today's Gmail sends</span>
                <span className={overLimit ? 'text-destructive font-semibold' : nearLimit ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>
                  {dailyStats.gmail} / {gmailLimit.toLocaleString()}
                </span>
              </div>
              {overLimit && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Daily Gmail limit reached. Sends are automatically falling back to Resend for the rest of the day.
                  </AlertDescription>
                </Alert>
              )}
              {!overLimit && nearLimit && (
                <Alert className="mt-2 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                    You're near your daily Gmail limit. Any sends over {gmailLimit.toLocaleString()} today will automatically use Resend.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Test button */}
            <div className="space-y-2">
              <Label htmlFor="testTo">Send a test email</Label>
              <div className="flex gap-2">
                <Input id="testTo" type="email" placeholder="test@example.com" value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)} />
                <Button onClick={sendTestEmail} disabled={testing || !testEmailTo.trim()} variant="outline" className="gap-2">
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Test emails go through Gmail SMTP directly with no fallback, so any error message reflects the real Gmail response.
              </p>
            </div>
          </div>
        )}

        <Separator />

        {/* Resend key */}
        <div className="space-y-2">
          <Label htmlFor="resendApiKey">
            Resend API Key (optional){hasResendKey ? ' — saved' : ''}
          </Label>
          <Input id="resendApiKey" type="password" autoComplete="new-password"
            placeholder={hasResendKey ? '••••••••  (leave blank to keep current key)' : 're_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
            value={settings.resend_api_key}
            onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })} />
          <p className="text-xs text-muted-foreground">
            Your organization's own Resend API key. Get one at{' '}
            <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline text-primary">resend.com/api-keys</a>
            . Used when the send method above is set to Resend, and also as the automatic fallback when Gmail SMTP fails.
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
