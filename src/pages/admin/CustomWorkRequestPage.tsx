import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PlanFeatureGate } from '@/components/admin/PlanFeatureGate';
import { SEOHead } from '@/components/SEOHead';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Globe,
  MessageSquare,
  Mail,
  Upload,
  FileText,
  Sparkles,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  CircleDashed,
} from 'lucide-react';

const MENU = [
  {
    id: 'website_build',
    label: 'Build me a website',
    description:
      'A website on your own domain, your account, connected to TidyWise CRM. Leads flow straight in.',
    icon: Globe,
  },
  {
    id: 'sms_setup',
    label: 'Set up my SMS',
    description:
      'We configure SMS notifications and write your first templates: review request, reminder, win-back.',
    icon: MessageSquare,
  },
  {
    id: 'email_marketing_setup',
    label: 'Set up email marketing',
    description:
      'Welcome sequence, follow-ups, and a seasonal promo — written and scheduled for you.',
    icon: Mail,
  },
  {
    id: 'customer_import',
    label: 'Import my customers',
    description:
      'CSV from your old CRM (Jobber, Housecall Pro, Google Sheets, anything). We clean and import.',
    icon: Upload,
  },
  {
    id: 'scripts_documents_pack',
    label: 'Scripts & documents pack',
    description:
      'Hiring scripts, contractor agreement, client service agreement, employee handbook, onboarding checklist, complaint resolution — full bundle.',
    icon: FileText,
  },
  {
    id: 'something_else',
    label: 'Something else',
    description: 'Tell us what you need. We review and either pick it up or tell you why we cannot.',
    icon: Sparkles,
  },
] as const;

type RequestType = (typeof MENU)[number]['id'];

interface RequestRow {
  id: string;
  request_type: RequestType;
  details: string | null;
  status: 'submitted' | 'approved' | 'in_progress' | 'completed' | 'declined' | 'cancelled';
  submitted_at: string;
  fulfilled_at: string | null;
  declined_reason: string | null;
  admin_notes: string | null;
  billing_period_start: string;
  billing_period_end: string;
}

function statusBadge(status: RequestRow['status']) {
  switch (status) {
    case 'submitted':
      return { label: 'Submitted', variant: 'secondary' as const, Icon: Clock };
    case 'approved':
      return { label: 'Approved', variant: 'secondary' as const, Icon: CheckCircle2 };
    case 'in_progress':
      return { label: 'In progress', variant: 'default' as const, Icon: CircleDashed };
    case 'completed':
      return { label: 'Completed', variant: 'default' as const, Icon: CheckCircle2 };
    case 'declined':
      return { label: 'Declined', variant: 'destructive' as const, Icon: XCircle };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'outline' as const, Icon: XCircle };
  }
}

function labelFor(type: RequestType): string {
  return MENU.find((m) => m.id === type)?.label ?? type;
}

export default function CustomWorkRequestPage() {
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [selectedType, setSelectedType] = useState<RequestType | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadRequests() {
    const { data, error } = await (supabase as any)
      .from('custom_work_requests')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(20);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRequests((data as RequestRow[]) ?? []);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  // Active = not declined/cancelled in the current period. The server
  // is the truth; this is a soft client-side cue.
  const activeThisPeriod = (requests ?? []).find((r) => {
    const start = new Date(r.billing_period_start).getTime();
    const end = new Date(r.billing_period_end).getTime();
    const now = Date.now();
    return (
      start <= now &&
      now < end &&
      r.status !== 'declined' &&
      r.status !== 'cancelled'
    );
  });

  async function handleSubmit() {
    if (!selectedType) {
      toast.error('Pick what you need first.');
      return;
    }
    if (selectedType === 'something_else' && !details.trim()) {
      toast.error('Tell us what you need.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'submit-custom-work-request',
        {
          body: {
            request_type: selectedType,
            details: details.trim() || null,
          },
        },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Got it — we'll be in touch within 24 hours.");
      setSelectedType(null);
      setDetails('');
      await loadRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminLayout title="Custom work">
<div className="portal-v2 portal-v2-scroll">
      <SEOHead
        title="Custom work | TidyWise"
        description="Submit your monthly done-for-you request."
        noIndex
      />

      <PlanFeatureGate feature="custom_work_requests">
        <div className="space-y-6 max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Submit a request</span>
                {activeThisPeriod ? (
                  <Badge variant="secondary">Used this month</Badge>
                ) : (
                  <Badge>1 request available this month</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeThisPeriod ? (
                <div className="bg-muted/40 border rounded-lg p-5">
                  <p className="text-sm text-muted-foreground mb-2">
                    Your request for this month is{' '}
                    <span className="font-medium text-foreground">
                      {statusBadge(activeThisPeriod.status).label.toLowerCase()}
                    </span>
                    :
                  </p>
                  <p className="font-medium mb-1">
                    {labelFor(activeThisPeriod.request_type)}
                  </p>
                  {activeThisPeriod.details && (
                    <p className="text-sm text-muted-foreground italic">
                      "{activeThisPeriod.details}"
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-3">
                    Your next request unlocks{' '}
                    {/* eslint-disable-next-line local/no-device-local-dates -- viewer-local display of a stored instant, not a business-day boundary */}
                {new Date(activeThisPeriod.billing_period_end).toLocaleDateString(
                      'en-US',
                      { month: 'long', day: 'numeric' },
                    )}
                    .
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <RadioGroup
                    value={selectedType ?? ''}
                    onValueChange={(v) => setSelectedType(v as RequestType)}
                    className="grid sm:grid-cols-2 gap-3"
                  >
                    {MENU.map((item) => {
                      const Icon = item.icon;
                      const active = selectedType === item.id;
                      return (
                        <label
                          key={item.id}
                          htmlFor={`opt-${item.id}`}
                          className={`flex gap-3 p-4 rounded-lg border-2 cursor-pointer transition ${
                            active
                              ? 'border-primary bg-primary/5'
                              : 'border-muted hover:border-muted-foreground/40'
                          }`}
                        >
                          <RadioGroupItem
                            id={`opt-${item.id}`}
                            value={item.id}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 font-medium">
                              <Icon className="h-4 w-4 text-primary" />
                              {item.label}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </RadioGroup>

                  {selectedType === 'something_else' && (
                    <div className="space-y-2">
                      <Label htmlFor="details">Tell us what you need</Label>
                      <Textarea
                        id="details"
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Describe the project. Be specific about what you want delivered."
                        rows={4}
                        maxLength={2000}
                      />
                      <p className="text-xs text-muted-foreground">
                        {details.length}/2000 — we review and either pick it up or tell you
                        why we can't.
                      </p>
                    </div>
                  )}

                  {selectedType && selectedType !== 'something_else' && (
                    <div className="space-y-2">
                      <Label htmlFor="extra-details">
                        Any extra context? <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Textarea
                        id="extra-details"
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Anything specific you want us to know."
                        rows={3}
                        maxLength={2000}
                      />
                    </div>
                  )}

                  <Button
                    onClick={handleSubmit}
                    disabled={!selectedType || submitting}
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Submit request'
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Past requests</CardTitle>
            </CardHeader>
            <CardContent>
              {requests === null ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No requests yet. Submit one above when you're ready.
                </p>
              ) : (
                <div className="space-y-3">
                  {requests.map((r) => {
                    const { label, variant, Icon } = statusBadge(r.status);
                    return (
                      <div
                        key={r.id}
                        className="border rounded-lg p-4 flex items-start gap-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">
                              {labelFor(r.request_type)}
                            </span>
                            <Badge variant={variant} className="gap-1">
                              <Icon className="h-3 w-3" />
                              {label}
                            </Badge>
                          </div>
                          {r.details && (
                            <p className="text-sm text-muted-foreground italic mb-1">
                              "{r.details}"
                            </p>
                          )}
                          {r.declined_reason && (
                            <p className="text-sm text-destructive">
                              Declined: {r.declined_reason}
                            </p>
                          )}
                          {r.admin_notes && (
                            <p className="text-sm text-muted-foreground">
                              Note from support: {r.admin_notes}
                            </p>
                          )}
                          {/* eslint-disable local/no-device-local-dates -- viewer-local display of stored instants, not business-day boundaries */}
                          <p className="text-xs text-muted-foreground mt-2">
                            Submitted {new Date(r.submitted_at).toLocaleDateString()}
                            {r.fulfilled_at &&
                              ` · Completed ${new Date(r.fulfilled_at).toLocaleDateString()}`}
                          </p>
                          {/* eslint-enable local/no-device-local-dates */}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PlanFeatureGate>
    </div>
</AdminLayout>
  );
}
