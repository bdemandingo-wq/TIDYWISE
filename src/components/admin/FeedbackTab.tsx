import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle2, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';

/**
 * Feedback form — native, replacing a Jotform iframe (2026-08-18).
 *
 * Submissions land in public.product_feedback with organization_id and user_id
 * attached from the session, so the sender never types who they are and it
 * cannot be got wrong. The founder is notified over the same OpenPhone path the
 * signup alert uses, and reads submissions at /dashboard/platform-feedback.
 *
 * The notify call is deliberately NOT awaited into the success state: the row
 * is already stored, and telling someone their feedback failed because an SMS
 * gateway was down would be a lie about the thing they actually care about.
 */

const TOPICS = [
  { value: 'broken', label: "Something's broken" },
  { value: 'suggestion', label: 'A suggestion' },
  { value: 'like', label: 'Something I like' },
  { value: 'dislike', label: "Something I don't like" },
  { value: 'other', label: 'Other' },
] as const;

const SEVERITIES = [
  { value: 'blocking', label: 'Blocking me' },
  { value: 'annoying', label: 'Annoying' },
  { value: 'idea', label: 'Just an idea' },
] as const;

const MAX_MESSAGE = 5000;

export function FeedbackTab() {
  const { user } = useAuth();
  const { organizationId } = useOrgId();

  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [appArea, setAppArea] = useState('');
  const [severity, setSeverity] = useState('');
  const [senderName, setSenderName] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const resetForm = () => {
    setTopic('');
    setMessage('');
    setAppArea('');
    setSeverity('');
    setSenderName('');
    setReplyEmail('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!topic) {
      toast.error('Pick what this is about so it gets to the right place.');
      return;
    }
    if (!message.trim()) {
      toast.error('Tell us what happened — the message can’t be empty.');
      return;
    }
    if (replyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim())) {
      toast.error('That email doesn’t look right. Leave it blank if you’d rather not hear back.');
      return;
    }
    if (!user?.id) {
      toast.error('Your session expired. Sign in again and resend — nothing was lost.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('product_feedback')
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          topic,
          message: message.trim().slice(0, MAX_MESSAGE),
          app_area: appArea.trim() || null,
          severity: severity || null,
          sender_name: senderName.trim() || null,
          reply_email: replyEmail.trim() || null,
        })
        .select('id')
        .single();

      // Not swallowed into a fake success: a feedback form that quietly drops
      // what you wrote is worse than no form at all.
      if (error) throw error;

      // Best effort. The submission is already saved and readable in-app.
      supabase.functions
        .invoke('notify-product-feedback', { body: { feedback_id: data.id } })
        .catch((err) => console.error('[feedback] notify failed (submission saved):', err));

      resetForm();
      setSent(true);
    } catch (err) {
      console.error('[feedback] submit failed:', err);
      toast.error('Couldn’t send that. Try again in a moment — your text is still here.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Send feedback
        </CardTitle>
        <CardDescription>
          Suggestions, problems, and anything you like or don't. It goes straight to the person
          building TidyWise — every one gets read.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="flex items-center gap-2 font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5" />
              Thanks — that came through.
            </div>
            <p className="text-sm text-muted-foreground">
              It's with the founder now. If you left an email, you'll get a reply there.
            </p>
            <Button variant="outline" size="sm" onClick={() => setSent(false)}>
              Send another
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                What's this about? <span className="text-destructive">*</span>
              </legend>
              <RadioGroup value={topic} onValueChange={setTopic} className="gap-2">
                {TOPICS.map((t) => (
                  <div key={t.value} className="flex items-center gap-3">
                    <RadioGroupItem value={t.value} id={`topic-${t.value}`} />
                    <Label htmlFor={`topic-${t.value}`} className="font-normal cursor-pointer">
                      {t.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="feedback-message">
                Tell us what happened <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MAX_MESSAGE}
                rows={6}
                placeholder="What were you doing, and what did you expect instead?"
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">
                {message.length}/{MAX_MESSAGE}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-area">Where in the app?</Label>
              <Input
                id="feedback-area"
                value={appArea}
                onChange={(e) => setAppArea(e.target.value)}
                maxLength={200}
                placeholder="Scheduler, invoices, the booking form…"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">How much is this holding you back?</legend>
              <RadioGroup value={severity} onValueChange={setSeverity} className="gap-2">
                {SEVERITIES.map((s) => (
                  <div key={s.value} className="flex items-center gap-3">
                    <RadioGroupItem value={s.value} id={`severity-${s.value}`} />
                    <Label htmlFor={`severity-${s.value}`} className="font-normal cursor-pointer">
                      {s.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feedback-name">Your name or business</Label>
                <Input
                  id="feedback-name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  maxLength={200}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback-email">Email if you'd like a reply</Label>
                <Input
                  id="feedback-email"
                  type="email"
                  value={replyEmail}
                  onChange={(e) => setReplyEmail(e.target.value)}
                  maxLength={255}
                  placeholder="Optional"
                />
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="min-h-11">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send feedback'
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
