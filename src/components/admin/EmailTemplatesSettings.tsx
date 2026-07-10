import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Mail, Save, Loader2, Info, Eye, Send, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface EmailTemplatesSettingsProps {
  organizationId?: string;
  confirmationEmailSubject: string;
  confirmationEmailBody: string;
  reminderEmailSubject: string;
  reminderEmailBody: string;
  onUpdate: (field: string, value: string) => void;
  onSave: () => void;
  saving: boolean;
  companyName?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

const availableVariables = [
  { key: '{{customer_name}}', desc: 'Customer full name' },
  { key: '{{booking_number}}', desc: 'Booking reference' },
  { key: '{{service_name}}', desc: 'Service type' },
  { key: '{{scheduled_date}}', desc: 'Appointment date' },
  { key: '{{scheduled_time}}', desc: 'Appointment time' },
  { key: '{{address}}', desc: 'Service address' },
  { key: '{{total_amount}}', desc: 'Total (no $)' },
  { key: '{{company_name}}', desc: 'Business name' },
];

interface PreviewResult {
  subject: string;
  html: string;
  from: string;
  replyTo: string;
}

function EmailPreviewDialog({
  organizationId,
  templateType,
  subject,
  body,
}: {
  organizationId?: string;
  templateType: 'confirmation' | 'reminder';
  subject: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);

  const loadPreview = async () => {
    if (!organizationId) {
      setError('Organization not loaded yet. Please try again in a moment.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('preview-org-email', {
        body: { organizationId, templateType, subject, body },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult(data as PreviewResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to render preview';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) loadPreview();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="w-4 h-4" />
          Preview Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Rendering with your organization's branding…
          </div>
        )}
        {error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button size="sm" variant="outline" onClick={loadPreview}>Retry</Button>
          </div>
        )}
        {result && !loading && !error && (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <div className="border rounded-md px-3 py-2 bg-muted/40 text-xs space-y-0.5 shrink-0">
              <div><span className="text-muted-foreground">From:</span> <span className="font-medium">{result.from}</span></div>
              <div><span className="text-muted-foreground">Reply-To:</span> <span className="font-medium">{result.replyTo}</span></div>
              <div><span className="text-muted-foreground">Subject:</span> <span className="font-semibold">{result.subject}</span></div>
            </div>
            <iframe
              title="Email preview"
              srcDoc={result.html}
              className="flex-1 w-full rounded-md border bg-white"
              sandbox=""
            />
            <p className="text-xs text-muted-foreground text-center shrink-0">
              Rendered with sample booking data. Real customer emails use the same layout with actual details.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SendTestButton({
  organizationId,
  templateType,
  subject,
  body,
}: {
  organizationId?: string;
  templateType: 'confirmation' | 'reminder';
  subject: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!organizationId) {
      toast.error('Organization not loaded yet.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-org-email', {
        body: { organizationId, templateType, toEmail: email, subject, body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Test sent via ${data.method}. Check ${email}.`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send test');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Send className="w-4 h-4" />
          Send Test Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sends this template using your organization's From address, so you can verify the real customer experience.
          </p>
          <div className="space-y-1">
            <Label htmlFor="test-email">Send to</Label>
            <Input
              id="test-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={sending}
            />
          </div>
          <Button onClick={send} disabled={sending} className="w-full gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send Test'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EmailTemplatesSettings({
  organizationId,
  confirmationEmailSubject,
  confirmationEmailBody,
  reminderEmailSubject,
  reminderEmailBody,
  onUpdate,
  onSave,
  saving,
}: EmailTemplatesSettingsProps) {
  const [activeTemplate, setActiveTemplate] = useState('confirmation');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email Templates
        </CardTitle>
        <CardDescription>
          Customize the emails sent to customers. Preview and test always use your organization's branding and From address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Available Variables</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableVariables.map((v) => (
              <Badge key={v.key} variant="secondary" title={v.desc}>{v.key}</Badge>
            ))}
          </div>
        </div>

        <Tabs value={activeTemplate} onValueChange={setActiveTemplate}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="confirmation" className="gap-2">
              <Mail className="w-4 h-4" /> Confirmation
            </TabsTrigger>
            <TabsTrigger value="reminder" className="gap-2">
              <Mail className="w-4 h-4" /> Reminder
            </TabsTrigger>
          </TabsList>

          <TabsContent value="confirmation" className="space-y-4 mt-4">
            <div className="flex justify-end gap-2">
              <SendTestButton
                organizationId={organizationId}
                templateType="confirmation"
                subject={confirmationEmailSubject}
                body={confirmationEmailBody}
              />
              <EmailPreviewDialog
                organizationId={organizationId}
                templateType="confirmation"
                subject={confirmationEmailSubject}
                body={confirmationEmailBody}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmationSubject">Subject Line</Label>
              <Input
                id="confirmationSubject"
                value={confirmationEmailSubject}
                onChange={(e) => onUpdate('confirmation_email_subject', e.target.value)}
                placeholder="Your Booking Confirmation - {{booking_number}}"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmationBody">Email Body</Label>
              <Textarea
                id="confirmationBody"
                value={confirmationEmailBody}
                onChange={(e) => onUpdate('confirmation_email_body', e.target.value)}
                placeholder="Enter your confirmation email template..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="reminder" className="space-y-4 mt-4">
            <div className="flex justify-end gap-2">
              <SendTestButton
                organizationId={organizationId}
                templateType="reminder"
                subject={reminderEmailSubject}
                body={reminderEmailBody}
              />
              <EmailPreviewDialog
                organizationId={organizationId}
                templateType="reminder"
                subject={reminderEmailSubject}
                body={reminderEmailBody}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderSubject">Subject Line</Label>
              <Input
                id="reminderSubject"
                value={reminderEmailSubject}
                onChange={(e) => onUpdate('reminder_email_subject', e.target.value)}
                placeholder="Reminder: Your Cleaning is Tomorrow - {{booking_number}}"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderBody">Email Body</Label>
              <Textarea
                id="reminderBody"
                value={reminderEmailBody}
                onChange={(e) => onUpdate('reminder_email_body', e.target.value)}
                placeholder="Enter your reminder email template..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </TabsContent>
        </Tabs>

        <Button className="gap-2" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Templates
        </Button>
      </CardContent>
    </Card>
  );
}
