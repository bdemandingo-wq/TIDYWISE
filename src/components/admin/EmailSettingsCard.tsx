import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Send,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
import { DomainVerificationCard } from '@/components/admin/DomainVerificationCard';

type SendMethod = 'resend' | 'gmail_smtp';
type AccountType = 'consumer' | 'workspace';

interface EmailSettings {
  id?: string;
  from_name: string;
  from_email: string;
  reply_to_email: string;
  email_footer: string;
  // Write-only fields — never returned by the API.
  resend_api_key: string;
  email_send_method: SendMethod;
  gmail_account_type: AccountType;
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
  const [showAdvancedResend, setShowAdvancedResend] = useState(false);

  useEffect(() => {
    if (organization?.id) {
      fetchEmailSettings();
      fetchDailyStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const fetchEmailSettings = async () => {
    try {
      const { data: rows, error } = await supabase.rpc('get_org_email_settings_safe' as never, {
        _organization_id: organization!.id,
      } as never);
      if (error) throw error;
      const rowsAny = rows as any;
      const data = Array.isArray(rowsAny) ? rowsAny[0] : rowsAny;

      if (data) {
        setSettings({
          id: data.id,
          from_name: data.from_name || '',
          from_email: data.from_email || '',
          reply_to_email: data.reply_to_email || '',
          email_footer: data.email_footer || '',
          resend_api_key: '',
          email_send_method: (data.email_send_method || 'resend') as SendMethod,
          gmail_account_type: (data.gmail_account_type || 'consumer') as AccountType,
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

  const saveAll = async () => {
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
  const gmailPct = Math.min(100, Math.round((dailyStats.gmail / gmailLimit) * 100));
  const nearLimit = dailyStats.gmail >= gmailLimit * 0.8;
  const overLimit = dailyStats.gmail >= gmailLimit;

  const method = settings.email_send_method;
  const gmailConfigured = method === 'gmail_smtp' && !!settings.smtp_email && hasSmtpPassword;

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

  const MethodCard = ({
    value,
    icon: Icon,
    title,
    tagline,
    bullets,
  }: {
    value: SendMethod;
    icon: typeof Mail;
    title: string;
    tagline: string;
    bullets: string[];
  }) => {
    const selected = method === value;
    return (
      <button
        type="button"
        onClick={() => setSettings({ ...settings, email_send_method: value })}
        className={`text-left rounded-xl border-2 p-4 transition-all ${
          selected
            ? 'border-primary bg-primary/5 shadow-sm'
            : 'border-border hover:border-primary/40 hover:bg-muted/30'
        }`}
        aria-pressed={selected}
      >
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 rounded-lg p-2 ${
              selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{title}</span>
              {selected && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Selected
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{tagline}</p>
            <ul className="mt-2 space-y-1">
              {bullets.map((b) => (
                <li key={b} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary chip */}
      {gmailConfigured && method === 'gmail_smtp' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="text-sm text-emerald-900 dark:text-emerald-100">
            Sending from: <span className="font-semibold">{settings.smtp_email}</span>
          </div>
        </div>
      )}
      {method === 'resend' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="text-sm text-emerald-900 dark:text-emerald-100">
            Sending via <span className="font-semibold">TidyWise default</span>
            {settings.from_email ? <> as <span className="font-semibold">{settings.from_email}</span></> : null}
          </div>
        </div>
      )}

      {/* Card 1 — How your emails are sent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            How your emails are sent
          </CardTitle>
          <CardDescription>
            Pick how customer emails leave your organization. System emails (signup, password reset, admin alerts) always
            send from TidyWise regardless of your choice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <MethodCard
              value="resend"
              icon={Mail}
              title="TidyWise default"
              tagline="Zero setup. Emails send from our shared sending service."
              bullets={[
                'Nothing to configure — works right away',
                'Reliable, high-volume delivery',
                'Optionally verify your own domain below for stronger branding',
              ]}
            />
            <MethodCard
              value="gmail_smtp"
              icon={Send}
              title="Your own Gmail"
              tagline="Emails come from your real Gmail address; replies land in your Gmail inbox."
              bullets={[
                'Works with @gmail.com and Google Workspace',
                'No domain verification needed',
                'Automatic fallback to TidyWise if Gmail hiccups',
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">Not sure? Keep the default — it just works.</p>

          {/* Gmail-only fields */}
          {method === 'gmail_smtp' && (
            <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
              <div className="flex items-start gap-2">
                <Send className="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-semibold text-sm">Connect your Gmail</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Turn on 2-Step Verification, then create an app password at{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-primary"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                    , choose <strong>Mail</strong>, and paste the 16-character password here.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtpEmail">Gmail address</Label>
                  <Input
                    id="smtpEmail"
                    type="email"
                    placeholder="you@yourdomain.com or you@gmail.com"
                    value={settings.smtp_email}
                    onChange={(e) => setSettings({ ...settings, smtp_email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPassword">
                    App password{' '}
                    {hasSmtpPassword && (
                      <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> saved
                      </span>
                    )}
                  </Label>
                  <Input
                    id="smtpPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder={hasSmtpPassword ? '••••••••  (leave blank to keep current)' : 'abcd efgh ijkl mnop'}
                    value={settings.smtp_app_password}
                    onChange={(e) => setSettings({ ...settings, smtp_app_password: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Stored encrypted — never displayed again.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Account type</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { v: 'consumer', label: 'Personal Gmail', hint: '~500 emails per day' },
                      { v: 'workspace', label: 'Google Workspace', hint: '~2,000 emails per day' },
                    ] as { v: AccountType; label: string; hint: string }[]
                  ).map((opt) => {
                    const selected = settings.gmail_account_type === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setSettings({ ...settings, gmail_account_type: opt.v })}
                        className={`text-left rounded-lg border p-3 transition ${
                          selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Daily usage bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Today's Gmail sends</span>
                  <span
                    className={
                      overLimit
                        ? 'text-destructive font-semibold'
                        : nearLimit
                          ? 'text-amber-600 font-semibold'
                          : 'text-muted-foreground'
                    }
                  >
                    {dailyStats.gmail} / {gmailLimit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      overLimit ? 'bg-destructive' : nearLimit ? 'bg-amber-500' : 'bg-primary'
                    }`}
                    style={{ width: `${gmailPct}%` }}
                  />
                </div>
                {overLimit && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Daily Gmail limit reached. Sends automatically fall back to TidyWise for the rest of the day.
                    </AlertDescription>
                  </Alert>
                )}
                {!overLimit && nearLimit && (
                  <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                      You're near your daily Gmail limit. Sends over {gmailLimit.toLocaleString()} today auto-fallback
                      to TidyWise.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Test */}
              <div className="space-y-2">
                <Label htmlFor="testTo">Send a test email</Label>
                <div className="flex gap-2">
                  <Input
                    id="testTo"
                    type="email"
                    placeholder="test@example.com"
                    value={testEmailTo}
                    onChange={(e) => setTestEmailTo(e.target.value)}
                  />
                  <Button
                    onClick={sendTestEmail}
                    disabled={testing || !testEmailTo.trim()}
                    variant="outline"
                    className="gap-2"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send Test
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Test sends go through Gmail directly (no fallback), so errors reflect Gmail's real response.
                </p>
              </div>
            </div>
          )}

          {/* Resend-only advanced field */}
          {method === 'resend' && (
            <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
              <button
                type="button"
                onClick={() => setShowAdvancedResend((v) => !v)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {showAdvancedResend ? '− Hide' : '+ Show'} advanced (bring your own Resend key)
              </button>
              {showAdvancedResend && (
                <div className="space-y-2">
                  <Label htmlFor="resendApiKey">
                    Resend API Key {hasResendKey ? <span className="text-xs text-emerald-600">— saved</span> : null}
                  </Label>
                  <Input
                    id="resendApiKey"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      hasResendKey ? '••••••••  (leave blank to keep current key)' : 're_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                    }
                    value={settings.resend_api_key}
                    onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Most orgs don't need this. Get one at{' '}
                    <a
                      href="https://resend.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-primary"
                    >
                      resend.com/api-keys
                    </a>
                    . Also used as the fallback when Gmail SMTP fails.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Verification — only shown for Resend */}
      {method === 'resend' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4" />
            Verify your own domain so emails come from <em>you@yourdomain.com</em> instead of a shared sender.
          </div>
          <DomainVerificationCard />
        </div>
      )}

      {/* Card 2 — Sender identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Sender identity
          </CardTitle>
          <CardDescription>How your name, reply address, and footer appear to customers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fromName">From Name *</Label>
              <Input
                id="fromName"
                placeholder="Your Business Name"
                value={settings.from_name}
                onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">The name customers see in their inbox.</p>
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
                {method === 'gmail_smtp'
                  ? 'Should match (or be an alias of) your Gmail address above.'
                  : 'Use an address on a domain you\'ve verified below for best deliverability.'}
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
              Where customer replies go. Leave blank to use the From Email.
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
            <p className="text-xs text-muted-foreground">Appended to every customer email.</p>
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 flex-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                Changes apply to all customer emails: booking confirmations, reminders, invoices, review requests, and
                campaigns.
              </AlertDescription>
            </Alert>
            <Button onClick={saveAll} disabled={saving} className="gap-2 shrink-0">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save all email settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
