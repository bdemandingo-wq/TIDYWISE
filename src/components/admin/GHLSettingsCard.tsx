import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Send, Trash2, Zap, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { QueryError } from '@/components/QueryError';
import { ZAPIER_EVENT_META, ZAPIER_SAMPLE_PAYLOADS } from '@/lib/zapierEventSamples';

type EventKey = (typeof ZAPIER_EVENT_META)[number]['value'];

interface FieldMap {
  ghl_field: string;
  source: string;
  static_value?: string | null;
}
interface EventMapping {
  enabled: boolean;
  mappings: FieldMap[];
  tags?: string[];
}
type EventConfig = Partial<Record<EventKey, EventMapping>>;

interface GhlSettings {
  id?: string;
  enabled: boolean;
  webhook_url: string;
  auth_header_name: string;
  // auth_token is write-only — never read back from the API
  auth_token_set?: boolean;
  event_config: EventConfig;
}

const DEFAULT_MAPPINGS: Record<EventKey, FieldMap[]> = {
  'customer.created': [
    { ghl_field: 'email', source: 'email' },
    { ghl_field: 'phone', source: 'phone' },
    { ghl_field: 'firstName', source: 'first_name' },
    { ghl_field: 'lastName', source: 'last_name' },
    { ghl_field: 'address1', source: 'address' },
  ],
  'lead.created': [
    { ghl_field: 'email', source: 'email' },
    { ghl_field: 'phone', source: 'phone' },
    { ghl_field: 'firstName', source: 'name' },
    { ghl_field: 'source', source: 'source' },
    { ghl_field: 'notes', source: 'notes' },
  ],
  'booking.created': [
    { ghl_field: 'email', source: 'customer_email' },
    { ghl_field: 'firstName', source: 'customer_name' },
    { ghl_field: 'appointmentTime', source: 'scheduled_at' },
    { ghl_field: 'serviceName', source: 'service' },
    { ghl_field: 'amount', source: 'total_amount' },
  ],
  'booking.completed': [
    { ghl_field: 'email', source: 'customer_email' },
    { ghl_field: 'completedAt', source: 'completed_at' },
    { ghl_field: 'amount', source: 'total_amount' },
  ],
  'booking.cancelled': [
    { ghl_field: 'email', source: 'customer_email' },
    { ghl_field: 'cancelledAt', source: 'cancelled_at' },
    { ghl_field: 'reason', source: 'reason' },
  ],
  'invoice.paid': [
    { ghl_field: 'email', source: 'customer_email' },
    { ghl_field: 'amount', source: 'amount' },
    { ghl_field: 'paidAt', source: 'paid_at' },
  ],
  'estimate.sent': [
    { ghl_field: 'email', source: 'customer_email' },
    { ghl_field: 'amount', source: 'total_amount' },
    { ghl_field: 'sentAt', source: 'sent_at' },
  ],
  'review.received': [
    { ghl_field: 'firstName', source: 'customer_name' },
    { ghl_field: 'rating', source: 'rating' },
    { ghl_field: 'comment', source: 'comment' },
  ],
};

function blankSettings(): GhlSettings {
  return {
    enabled: false,
    webhook_url: '',
    auth_header_name: 'Authorization',
    event_config: {},
  };
}

function ensureMapping(cfg: EventConfig, evt: EventKey): EventMapping {
  return (
    cfg[evt] ?? {
      enabled: true,
      mappings: DEFAULT_MAPPINGS[evt] ?? [],
      tags: [],
    }
  );
}

export function GHLSettingsCard() {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<GhlSettings>(blankSettings());
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{
    success: boolean;
    status: number | null;
    error_code: string;
    error_hint: string;
    latency_ms?: number;
  } | null>(null);
  const [testingEvent, setTestingEvent] = useState<EventKey | null>(null);
  const [testResult, setTestResult] = useState<{
    event: EventKey;
    success: boolean;
    status: number | null;
    sent_body: unknown;
    response_snippet: string | null;
    error_code: string | null;
    error_hint: string | null;
    latency_ms?: number;
  } | null>(null);

  const { data, isLoading, error: settingsError } = useQuery({
    queryKey: ['ghl-settings', organization?.id],
    enabled: !!organization?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_ghl_settings')
        // auth_token column SELECT is revoked at the column level; safe to omit
        .select('id, enabled, webhook_url, auth_header_name, event_config')
        .eq('organization_id', organization!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Probe whether a token is configured server-side (without reading the value)
  const { data: tokenStatus, error: tokenStatusError } = useQuery({
    queryKey: ['ghl-token-status', organization?.id, data?.id],
    enabled: !!organization?.id && !!data?.id,
    queryFn: async () => {
      // We can't read auth_token directly; do a no-op validate call to learn the state.
      // It's cheap & informational — only run after we know the row exists.
      return null as null;
    },
  });

  useEffect(() => {
    if (data) {
      setDraft({
        id: (data as any).id,
        enabled: !!(data as any).enabled,
        webhook_url: (data as any).webhook_url ?? '',
        auth_header_name: (data as any).auth_header_name ?? 'Authorization',
        event_config: ((data as any).event_config ?? {}) as EventConfig,
      });
    } else if (data === null) {
      setDraft(blankSettings());
    }
  }, [data]);

  const isValidUrl = useMemo(() => {
    if (!draft.webhook_url) return false;
    try {
      const u = new URL(draft.webhook_url);
      return u.protocol === 'https:';
    } catch {
      return false;
    }
  }, [draft.webhook_url]);

  async function handleSave() {
    if (!organization?.id) return;
    if (draft.webhook_url && !isValidUrl) {
      toast.error('Webhook URL must be a valid https:// URL');
      return;
    }
    setSaving(true);
    try {
      const upsertBody: Record<string, unknown> = {
        organization_id: organization.id,
        enabled: draft.enabled,
        webhook_url: draft.webhook_url || null,
        auth_header_name: draft.auth_header_name || 'Authorization',
        event_config: draft.event_config,
      };
      // Only include the token when the user actually typed a new value
      if (tokenInput) upsertBody.auth_token = tokenInput;

      const { error } = await supabase
        .from('org_ghl_settings')
        .upsert(upsertBody as never, { onConflict: 'organization_id' });
      if (error) throw error;
      setTokenInput('');
      toast.success('GoHighLevel settings saved');
      qc.invalidateQueries({ queryKey: ['ghl-settings', organization.id] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save GHL settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleValidate() {
    if (!organization?.id) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-dispatch', {
        body: { organization_id: organization.id, mode: 'validate' },
      });
      if (error) throw error;
      setValidateResult(data as any);
      if ((data as any)?.success) toast.success('GHL webhook reachable');
      else toast.error((data as any)?.error_hint ?? 'Webhook validation failed');
    } catch (e: any) {
      toast.error(e?.message ?? 'Validation failed');
    } finally {
      setValidating(false);
    }
  }

  async function handleTest(evt: EventKey) {
    if (!organization?.id) return;
    setTestingEvent(evt);
    setTestResult(null);
    try {
      const mapping = ensureMapping(draft.event_config, evt);
      const { data, error } = await supabase.functions.invoke('ghl-dispatch', {
        body: {
          organization_id: organization.id,
          event_type: evt,
          payload: ZAPIER_SAMPLE_PAYLOADS[evt],
          mode: 'test',
          override_mapping: mapping,
        },
      });
      if (error) throw error;
      setTestResult({ event: evt, ...(data as any) });
      if ((data as any)?.success) toast.success(`Test ${evt} delivered to GHL`);
      else toast.error((data as any)?.error_hint ?? 'Test delivery failed');
    } catch (e: any) {
      toast.error(e?.message ?? 'Test failed');
    } finally {
      setTestingEvent(null);
    }
  }

  function updateEventMapping(evt: EventKey, updater: (m: EventMapping) => EventMapping) {
    setDraft((d) => {
      const next: EventConfig = { ...d.event_config };
      const current = ensureMapping(next, evt);
      next[evt] = updater(current);
      return { ...d, event_config: next };
    });
  }

  function addRow(evt: EventKey) {
    updateEventMapping(evt, (m) => ({ ...m, mappings: [...m.mappings, { ghl_field: '', source: '' }] }));
  }
  function removeRow(evt: EventKey, idx: number) {
    updateEventMapping(evt, (m) => ({ ...m, mappings: m.mappings.filter((_, i) => i !== idx) }));
  }
  function setRow(evt: EventKey, idx: number, patch: Partial<FieldMap>) {
    updateEventMapping(evt, (m) => ({
      ...m,
      mappings: m.mappings.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));
  }

  if (settingsError) return <QueryError subject="GHL settings" onRetry={() => qc.invalidateQueries({ queryKey: ['ghl-settings', organization?.id] })} />;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              GoHighLevel (GHL)
              {draft.enabled && draft.webhook_url ? (
                <Badge variant="secondary" className="ml-1">Active</Badge>
              ) : (
                <Badge variant="outline" className="ml-1">Off</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Send CRM events directly to a GoHighLevel Inbound Webhook — no Zapier required.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
              aria-label="Enable GHL integration"
            />
            <span className="text-sm text-muted-foreground">{draft.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* --- Setup guide --- */}
        <Accordion type="single" collapsible defaultValue={draft.webhook_url ? undefined : 'setup'}>
          <AccordionItem value="setup">
            <AccordionTrigger>How to set up the GHL Inbound Webhook</AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <ol className="list-decimal pl-5 space-y-1">
                <li>In GoHighLevel, open <strong>Automation → Workflows</strong> and create a new workflow.</li>
                <li>Add the <strong>Inbound Webhook</strong> trigger. GHL will generate a unique URL — copy it.</li>
                <li>Paste that URL into the <strong>Webhook URL</strong> field below.</li>
                <li>(Optional) Add an action like <em>Create/Update Contact</em>, <em>Add to Workflow</em>, or <em>Create Opportunity</em>.</li>
                <li>(Optional) For private integrations, generate a token in <strong>Settings → Private Integrations</strong> and paste it as the auth token below.</li>
                <li>Hit <strong>Save</strong>, then use <strong>Validate webhook</strong> and the per-event <strong>Test</strong> buttons to confirm delivery.</li>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* --- Connection fields --- */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ghl-url">Inbound Webhook URL</Label>
            <Input
              id="ghl-url"
              placeholder="https://services.leadconnectorhq.com/hooks/..."
              value={draft.webhook_url}
              onChange={(e) => setDraft((d) => ({ ...d, webhook_url: e.target.value.trim() }))}
            />
            {draft.webhook_url && !isValidUrl && (
              <p className="text-xs text-destructive">Must be a valid https:// URL.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="ghl-header">Auth header name</Label>
              <Input
                id="ghl-header"
                placeholder="Authorization"
                value={draft.auth_header_name}
                onChange={(e) => setDraft((d) => ({ ...d, auth_header_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ghl-token">
                Auth token <span className="text-xs text-muted-foreground">(optional, stored encrypted)</span>
              </Label>
              <Input
                id="ghl-token"
                type="password"
                placeholder={draft.id ? '••••••••  (leave blank to keep current)' : 'Paste GHL Private Integration token'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Sent as <code>{draft.auth_header_name}: Bearer &lt;token&gt;</code>. We never display it again after saving.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save GHL settings
            </Button>
            <Button variant="outline" onClick={handleValidate} disabled={validating || !draft.webhook_url}>
              {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Validate webhook
            </Button>
            {validateResult && (
              <div className="flex items-center gap-2 text-sm">
                {validateResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>Reachable · {validateResult.status} · {validateResult.latency_ms}ms</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">{validateResult.error_hint || validateResult.error_code}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- Event mapper --- */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Event mappings</h3>
            <p className="text-xs text-muted-foreground">
              Pick which CRM events flow into GHL and map each source field to the GHL field that should receive it.
              Leave the source blank and use Static value to send a constant (e.g. a tag).
            </p>
          </div>

          <Accordion type="multiple" className="w-full">
            {ZAPIER_EVENT_META.map((evt) => {
              const mapping = ensureMapping(draft.event_config, evt.value);
              const sample = ZAPIER_SAMPLE_PAYLOADS[evt.value];
              const sampleKeys = Object.keys(sample);
              const isTesting = testingEvent === evt.value;
              return (
                <AccordionItem key={evt.value} value={evt.value}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2 flex-wrap text-left">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{evt.value}</code>
                      <span className="text-sm">{evt.label}</span>
                      {mapping.enabled ? (
                        <Badge variant="secondary" className="ml-2">On</Badge>
                      ) : (
                        <Badge variant="outline" className="ml-2">Off</Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={mapping.enabled}
                        onCheckedChange={(v) =>
                          updateEventMapping(evt.value, (m) => ({ ...m, enabled: v }))
                        }
                      />
                      <span className="text-sm text-muted-foreground">
                        {mapping.enabled ? 'This event sends to GHL' : 'Skipped — will not send'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {mapping.mappings.map((row, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-start">
                          <div className="col-span-12 sm:col-span-4">
                            <Input
                              placeholder="GHL field (e.g. email)"
                              value={row.ghl_field}
                              onChange={(e) => setRow(evt.value, i, { ghl_field: e.target.value })}
                            />
                          </div>
                          <div className="col-span-7 sm:col-span-4">
                            <Select
                              value={row.source || '__none__'}
                              onValueChange={(v) =>
                                setRow(evt.value, i, { source: v === '__none__' ? '' : v })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Source field" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— None (use static value) —</SelectItem>
                                {sampleKeys.map((k) => (
                                  <SelectItem key={k} value={k}>{k}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4 sm:col-span-3">
                            <Input
                              placeholder="Static value (optional)"
                              value={row.static_value ?? ''}
                              onChange={(e) => setRow(evt.value, i, { static_value: e.target.value })}
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRow(evt.value, i)}
                              aria-label="Remove mapping"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addRow(evt.value)}>
                        <Plus className="h-4 w-4 mr-1" /> Add field
                      </Button>
                    </div>

                    <div>
                      <Label className="text-xs">Preview body sent to GHL</Label>
                      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-48">
{JSON.stringify(buildPreview(evt.value, organization?.id ?? 'org_xxx', mapping, sample), null, 2)}
                      </pre>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleTest(evt.value)}
                        disabled={isTesting || !draft.webhook_url}
                      >
                        {isTesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                        Test {evt.value}
                      </Button>
                      {testResult?.event === evt.value && (
                        <div className="text-xs flex items-center gap-2">
                          {testResult.success ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                          <span>
                            {testResult.success ? 'Delivered' : 'Failed'} · {testResult.status ?? '—'} · {testResult.latency_ms}ms
                            {testResult.error_hint ? ` · ${testResult.error_hint}` : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {testResult?.event === evt.value && testResult.response_snippet && (
                      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-32">
{testResult.response_snippet}
                      </pre>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </CardContent>
    </Card>
  );
}

function buildPreview(
  event: EventKey,
  organizationId: string,
  mapping: EventMapping,
  sample: Record<string, unknown>,
): Record<string, unknown> {
  const meta = {
    event_type: event,
    organization_id: organizationId,
    occurred_at: '2026-06-29T15:00:00.000Z',
    source: 'tidywise_crm',
  };
  if (!mapping.mappings.length) return { ...meta, ...sample };
  const out: Record<string, unknown> = { ...meta };
  for (const m of mapping.mappings) {
    if (!m.ghl_field) continue;
    const value =
      m.static_value !== undefined && m.static_value !== null && m.static_value !== ''
        ? m.static_value
        : (sample as any)[m.source];
    if (value !== undefined) out[m.ghl_field] = value;
  }
  if (mapping.tags?.length) out.tags = mapping.tags;
  return out;
}
