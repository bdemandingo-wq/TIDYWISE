import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, MessageSquare, Mail, Zap } from 'lucide-react';

type Channel = 'sms' | 'email' | 'both';
type Direction = 'before' | 'after' | 'immediate';
type Unit = 'minutes' | 'hours' | 'days';

interface StepRow {
  id?: string;
  position: number;
  label: string;
  offset_value: number;
  offset_unit: Unit;
  direction: Direction;
  channel: Channel;
  recipient_client: boolean;
  recipient_cleaner: boolean;
  recipient_owner: boolean;
  sms_body: string;
  email_subject: string;
  email_body: string;
  enabled: boolean;
}

interface TriggerRow {
  id?: string;
  trigger_key: string;
}

export const TRIGGER_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'booking_created', label: 'Booking Created', hint: 'When a new booking is added' },
  { key: 'booking_confirmed', label: 'Booking Confirmed', hint: 'When status becomes confirmed' },
  { key: 'booking_paid', label: 'Booking Paid', hint: 'When payment is captured' },
  { key: 'booking_completed', label: 'Booking Completed', hint: 'When a job is marked complete' },
  { key: 'quote_sent', label: 'Quote Sent', hint: 'When a quote is sent to the client' },
  { key: 'time_before_appointment', label: 'Time Before Appointment', hint: 'X hrs/days before scheduled_at' },
  { key: 'time_after_appointment', label: 'Time After Appointment', hint: 'X hrs/days after completion' },
  { key: 'recurring_lapse', label: 'Recurring Lapse', hint: 'Recurring booking missed its next date' },
  { key: 'customer_inactive', label: 'Customer Inactive', hint: 'No booking for N days' },
  { key: 'holiday_offset', label: 'Holiday Offset', hint: 'N days before a US holiday' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  automationKey: string;
  automationName: string;
}

function newStep(position: number): StepRow {
  return {
    position,
    label: 'New Step',
    offset_value: 0,
    offset_unit: 'hours',
    direction: 'after',
    channel: 'sms',
    recipient_client: true,
    recipient_cleaner: false,
    recipient_owner: false,
    sms_body: '',
    email_subject: '',
    email_body: '',
    enabled: true,
  };
}

export function AutomationEditorDialog({ open, onOpenChange, organizationId, automationKey, automationName }: Props) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(automationName);
  const [enabled, setEnabled] = useState(false);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [definitionId, setDefinitionId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['automation-def', organizationId, automationKey],
    enabled: open && !!organizationId,
    queryFn: async () => {
      const { data: def } = await supabase
        .from('automation_definitions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('automation_key', automationKey)
        .maybeSingle();

      if (!def) return { def: null, triggers: [], steps: [] };
      const [{ data: trigs }, { data: sts }] = await Promise.all([
        supabase.from('automation_triggers').select('*').eq('automation_id', def.id),
        supabase.from('automation_steps').select('*').eq('automation_id', def.id).order('position'),
      ]);
      return { def, triggers: trigs ?? [], steps: sts ?? [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    if (data.def) {
      setDefinitionId(data.def.id);
      setName(data.def.name);
      setEnabled(data.def.enabled);
      setTriggers(data.triggers.map((t: any) => ({ id: t.id, trigger_key: t.trigger_key })));
      setSteps(
        data.steps.length
          ? data.steps.map((s: any) => ({
              id: s.id,
              position: s.position,
              label: s.label,
              offset_value: s.offset_value,
              offset_unit: s.offset_unit,
              direction: s.direction,
              channel: s.channel,
              recipient_client: s.recipient_client,
              recipient_cleaner: s.recipient_cleaner,
              recipient_owner: s.recipient_owner,
              sms_body: s.sms_body ?? '',
              email_subject: s.email_subject ?? '',
              email_body: s.email_body ?? '',
              enabled: s.enabled,
            }))
          : [newStep(0)],
      );
    } else {
      setDefinitionId(null);
      setName(automationName);
      setEnabled(false);
      setTriggers([]);
      setSteps([newStep(0)]);
    }
  }, [data, automationName]);

  const toggleTrigger = (key: string) => {
    setTriggers(prev =>
      prev.some(t => t.trigger_key === key)
        ? prev.filter(t => t.trigger_key !== key)
        : [...prev, { trigger_key: key }],
    );
  };

  const updateStep = (idx: number, patch: Partial<StepRow>) => {
    setSteps(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addStep = () => setSteps(prev => [...prev, newStep(prev.length)]);
  const removeStep = (idx: number) => setSteps(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (triggers.length === 0) {
      toast.error('Add at least one trigger before saving.');
      return;
    }
    if (steps.length === 0) {
      toast.error('Add at least one step before saving.');
      return;
    }
    setSaving(true);
    try {
      let defId = definitionId;
      if (!defId) {
        const { data: created, error } = await supabase
          .from('automation_definitions')
          .insert({ organization_id: organizationId, automation_key: automationKey, name, enabled })
          .select()
          .single();
        if (error) throw error;
        defId = created.id;
      } else {
        const { error } = await supabase
          .from('automation_definitions')
          .update({ name, enabled })
          .eq('id', defId);
        if (error) throw error;
      }

      // Replace triggers
      await supabase.from('automation_triggers').delete().eq('automation_id', defId);
      if (triggers.length) {
        const { error: tErr } = await supabase.from('automation_triggers').insert(
          triggers.map(t => ({
            automation_id: defId,
            organization_id: organizationId,
            trigger_key: t.trigger_key,
          })),
        );
        if (tErr) throw tErr;
      }

      // Replace steps (delete + insert keeps conflict trigger clean)
      await supabase.from('automation_steps').delete().eq('automation_id', defId);
      const { error: sErr } = await supabase.from('automation_steps').insert(
        steps.map((s, i) => ({
          automation_id: defId,
          organization_id: organizationId,
          position: i,
          label: s.label,
          offset_value: s.offset_value,
          offset_unit: s.offset_unit,
          direction: s.direction,
          channel: s.channel,
          recipient_client: s.recipient_client,
          recipient_cleaner: s.recipient_cleaner,
          recipient_owner: s.recipient_owner,
          sms_body: s.sms_body,
          email_subject: s.email_subject,
          email_body: s.email_body,
          enabled: s.enabled,
        })),
      );
      if (sErr) throw sErr;

      toast.success('Automation saved');
      setDefinitionId(defId);
      qc.invalidateQueries({ queryKey: ['automation-def', organizationId, automationKey] });
      onOpenChange(false);
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to save';
      if (msg.includes('AUTOMATION_CONFLICT')) {
        toast.error(msg.replace(/^.*AUTOMATION_CONFLICT:\s*/, ''), { duration: 8000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[100vw] h-[100dvh] max-w-none rounded-none sm:w-auto sm:h-auto sm:max-w-4xl sm:max-h-[92vh] sm:rounded-lg p-0 flex flex-col">
        <DialogHeader className="p-4 sm:p-6 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Edit Automation
          </DialogTitle>
          <DialogDescription>Configure triggers, timing, message, and channel.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-28 sm:pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <>
              {/* Header */}
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Automation enabled</p>
                    <p className="text-xs text-muted-foreground">Off means no steps will fire even if triggers occur.</p>
                  </div>
                </div>
              </div>

              {/* Triggers */}
              <section className="space-y-2">
                <div>
                  <h3 className="font-semibold text-sm">Triggers</h3>
                  <p className="text-xs text-muted-foreground">Select one or more events that fire this automation.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TRIGGER_OPTIONS.map(t => {
                    const active = triggers.some(x => x.trigger_key === t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => toggleTrigger(t.key)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition ${active ? 'bg-amber-500 text-black border-amber-500' : 'bg-transparent border-border hover:bg-muted'}`}
                        title={t.hint}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Steps */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">Steps</h3>
                    <p className="text-xs text-muted-foreground">Each step is one send. Merge tokens: {'{{customer_name}}, {{company_name}}, {{booking_date}}, {{cleaner_name}}, {{review_link}}, {{booking_link}}'}.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={addStep}><Plus className="w-3.5 h-3.5 mr-1" />Add Interval</Button>
                </div>

                {steps.map((s, idx) => (
                  <div key={idx} className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-3">
                        <Input value={s.label} onChange={e => updateStep(idx, { label: e.target.value })} placeholder="Step label" />

                        {/* Timing */}
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={s.offset_value}
                            onChange={e => updateStep(idx, { offset_value: Number(e.target.value) })}
                          />
                          <Select value={s.offset_unit} onValueChange={(v) => updateStep(idx, { offset_unit: v as Unit })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={s.direction} onValueChange={(v) => updateStep(idx, { direction: v as Direction })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="before">Before trigger</SelectItem>
                              <SelectItem value="after">After trigger</SelectItem>
                              <SelectItem value="immediate">Immediate</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Channel segmented */}
                        <div>
                          <Label className="text-xs">Channel</Label>
                          <div className="flex gap-1 mt-1 p-1 rounded-md bg-muted w-fit">
                            {(['sms', 'email', 'both'] as Channel[]).map(c => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => updateStep(idx, { channel: c })}
                                className={`text-xs px-3 py-1 rounded ${s.channel === c ? 'bg-background shadow font-medium' : 'text-muted-foreground'}`}
                              >
                                {c === 'sms' ? 'SMS' : c === 'email' ? 'Email' : 'Both'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Recipients */}
                        <div className="flex flex-wrap gap-3">
                          {(['recipient_client', 'recipient_cleaner', 'recipient_owner'] as const).map(k => (
                            <label key={k} className="flex items-center gap-2 text-xs">
                              <Switch
                                checked={s[k]}
                                onCheckedChange={(v) => updateStep(idx, { [k]: v } as any)}
                              />
                              {k === 'recipient_client' ? 'Client' : k === 'recipient_cleaner' ? 'Cleaner' : 'Owner'}
                            </label>
                          ))}
                        </div>

                        {/* Message editors */}
                        {(s.channel === 'sms' || s.channel === 'both') && (
                          <div>
                            <Label className="text-xs flex items-center gap-1"><MessageSquare className="w-3 h-3" /> SMS body</Label>
                            <Textarea
                              value={s.sms_body}
                              onChange={e => updateStep(idx, { sms_body: e.target.value })}
                              rows={3}
                              placeholder="Hi {{customer_name}}, thanks for booking with {{company_name}}!"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">{s.sms_body.length} chars</p>
                          </div>
                        )}
                        {(s.channel === 'email' || s.channel === 'both') && (
                          <div className="space-y-2">
                            <div>
                              <Label className="text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Email subject</Label>
                              <Input
                                value={s.email_subject}
                                onChange={e => updateStep(idx, { email_subject: e.target.value })}
                                placeholder="Your booking with {{company_name}}"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Email body</Label>
                              <Textarea
                                value={s.email_body}
                                onChange={e => updateStep(idx, { email_body: e.target.value })}
                                rows={5}
                                placeholder="Hi {{customer_name}}, ..."
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <Switch checked={s.enabled} onCheckedChange={(v) => updateStep(idx, { enabled: v })} />
                          <span className="text-xs text-muted-foreground">Step enabled</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">#{idx + 1}</Badge>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeStep(idx)} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>

        {/* Sticky save bar */}
        <div className="fixed bottom-0 left-0 right-0 sm:static border-t bg-background p-3 sm:p-4 flex gap-2 justify-end" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
