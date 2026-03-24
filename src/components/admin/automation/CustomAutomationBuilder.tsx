import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Trash2, GripVertical, Loader2, Save, Pencil, Power,
  Zap, ArrowRight, Clock, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';

const TRIGGERS = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'booking_started', label: 'Booking Started' },
  { value: 'booking_confirmed', label: 'Booking Confirmed' },
  { value: 'service_complete', label: 'Service Complete' },
  { value: 'payment_received', label: 'Payment Received' },
  { value: 'no_response', label: 'No Response' },
  { value: 'recurring_due', label: 'Recurring Due' },
  { value: 'str_turnover', label: 'STR Turnover' },
];

const TAG_FILTERS = [
  { value: '', label: 'All Clients (no filter)' },
  { value: 'new_lead', label: 'New Lead' },
  { value: 'booked', label: 'Booked' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'str', label: 'STR' },
  { value: 'vip', label: 'VIP' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'commercial', label: 'Commercial' },
];

// Map custom triggers to default automation types they can override
const TRIGGER_TO_DEFAULT: Record<string, string> = {
  service_complete: 'review_request',
  recurring_due: 'rebooking_reminder',
  no_response: 'winback_60day',
};

interface Step {
  id?: string;
  step_order: number;
  delay_value: number;
  delay_unit: string;
  condition: string;
  message_body: string;
}

interface CustomAutomation {
  id?: string;
  name: string;
  trigger_type: string;
  tag_filter: string;
  is_active: boolean;
  overrides_default: string | null;
  steps: Step[];
}

const emptyStep: Step = {
  step_order: 1,
  delay_value: 0,
  delay_unit: 'min',
  condition: 'always',
  message_body: '',
};

const emptyAutomation: CustomAutomation = {
  name: '',
  trigger_type: 'new_lead',
  tag_filter: '',
  is_active: true,
  overrides_default: null,
  steps: [{ ...emptyStep }],
};

export function CustomAutomationBuilder() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<CustomAutomation>({ ...emptyAutomation });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['custom-automations', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('custom_automations' as any)
        .select('*, custom_automation_steps(*)')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((a: any) => ({
        ...a,
        steps: (a.custom_automation_steps || []).sort((x: any, y: any) => x.step_order - y.step_order),
      }));
    },
    enabled: !!organization?.id,
  });

  const openNew = (prefill?: CustomAutomation) => {
    setEditingAutomation(prefill || { ...emptyAutomation, steps: [{ ...emptyStep }] });
    setDialogOpen(true);
  };

  const openEdit = (auto: any) => {
    setEditingAutomation({
      id: auto.id,
      name: auto.name,
      trigger_type: auto.trigger_type,
      tag_filter: auto.tag_filter || '',
      is_active: auto.is_active,
      overrides_default: auto.overrides_default,
      steps: auto.steps.map((s: any) => ({
        id: s.id,
        step_order: s.step_order,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        condition: s.condition,
        message_body: s.message_body,
      })),
    });
    setDialogOpen(true);
  };

  const addStep = () => {
    setEditingAutomation(prev => ({
      ...prev,
      steps: [...prev.steps, { ...emptyStep, step_order: prev.steps.length + 1 }],
    }));
  };

  const removeStep = (idx: number) => {
    setEditingAutomation(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })),
    }));
  };

  const updateStep = (idx: number, field: keyof Step, value: any) => {
    setEditingAutomation(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    if (!editingAutomation.name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (editingAutomation.steps.length === 0 || editingAutomation.steps.some(s => !s.message_body.trim())) {
      toast.error('Each step needs a message body');
      return;
    }

    setSaving(true);
    try {
      // Determine if this overrides a default
      const overridesDefault = TRIGGER_TO_DEFAULT[editingAutomation.trigger_type] || null;

      if (editingAutomation.id) {
        // Update existing
        const { error } = await supabase
          .from('custom_automations' as any)
          .update({
            name: editingAutomation.name,
            trigger_type: editingAutomation.trigger_type,
            tag_filter: editingAutomation.tag_filter || null,
            is_active: editingAutomation.is_active,
            overrides_default: overridesDefault,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingAutomation.id);
        if (error) throw error;

        // Delete old steps and re-insert
        await supabase.from('custom_automation_steps' as any).delete().eq('automation_id', editingAutomation.id);

        const stepsData = editingAutomation.steps.map((s, i) => ({
          automation_id: editingAutomation.id,
          step_order: i + 1,
          delay_value: s.delay_value,
          delay_unit: s.delay_unit,
          condition: s.condition,
          message_body: s.message_body,
        }));

        const { error: stepsError } = await supabase.from('custom_automation_steps' as any).insert(stepsData);
        if (stepsError) throw stepsError;
      } else {
        // Create new
        const { data: newAuto, error } = await supabase
          .from('custom_automations' as any)
          .insert({
            organization_id: organization.id,
            name: editingAutomation.name,
            trigger_type: editingAutomation.trigger_type,
            tag_filter: editingAutomation.tag_filter || null,
            is_active: editingAutomation.is_active,
            overrides_default: overridesDefault,
          })
          .select()
          .single();
        if (error) throw error;

        const stepsData = editingAutomation.steps.map((s, i) => ({
          automation_id: (newAuto as any).id,
          step_order: i + 1,
          delay_value: s.delay_value,
          delay_unit: s.delay_unit,
          condition: s.condition,
          message_body: s.message_body,
        }));

        const { error: stepsError } = await supabase.from('custom_automation_steps' as any).insert(stepsData);
        if (stepsError) throw stepsError;
      }

      // If this overrides a default, pause it
      if (overridesDefault && editingAutomation.is_active) {
        await supabase
          .from('organization_automations')
          .update({ is_enabled: false })
          .eq('organization_id', organization.id)
          .eq('automation_type', overridesDefault);
        queryClient.invalidateQueries({ queryKey: ['organization-automations'] });
      }

      toast.success(editingAutomation.id ? 'Automation updated' : 'Custom automation created');
      queryClient.invalidateQueries({ queryKey: ['custom-automations'] });
      setDialogOpen(false);
    } catch (error) {
      console.error('Error saving custom automation:', error);
      toast.error('Failed to save automation');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('custom_automations' as any).delete().eq('id', id);
      if (error) throw error;
      toast.success('Automation deleted');
      queryClient.invalidateQueries({ queryKey: ['custom-automations'] });
    } catch {
      toast.error('Failed to delete automation');
    }
  };

  const handleToggle = async (id: string, is_active: boolean) => {
    try {
      const { error } = await supabase
        .from('custom_automations' as any)
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['custom-automations'] });
      toast.success(is_active ? 'Automation activated' : 'Automation paused');
    } catch {
      toast.error('Failed to update automation');
    }
  };

  const triggerLabel = (type: string) => TRIGGERS.find(t => t.value === type)?.label || type;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Custom Automations
              </CardTitle>
              <CardDescription>Build multi-step SMS sequences triggered by specific events</CardDescription>
            </div>
            <Button onClick={() => openNew()} className="gap-2" size="sm">
              <Plus className="w-4 h-4" /> New Custom Automation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : automations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No custom automations yet.</p>
              <p className="text-xs">Click "+ New Custom Automation" to create one, or import a template from the Suggestions tab.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((auto: any) => (
                <div key={auto.id} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(expandedId === auto.id ? null : auto.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-8 rounded-full ${auto.is_active ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{auto.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{triggerLabel(auto.trigger_type)}</Badge>
                          {auto.tag_filter && <Badge variant="secondary" className="text-[10px]">{auto.tag_filter}</Badge>}
                          <span className="text-xs text-muted-foreground">{auto.steps?.length || 0} step{(auto.steps?.length || 0) !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={auto.is_active}
                        onCheckedChange={(checked) => { handleToggle(auto.id, checked); }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {expandedId === auto.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                  {expandedId === auto.id && (
                    <div className="border-t p-3 bg-muted/20 space-y-2">
                      {auto.steps?.map((step: any, idx: number) => (
                        <div key={step.id} className="flex items-start gap-2 p-2 rounded-md bg-background border text-sm">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                {step.delay_value > 0 ? `Wait ${step.delay_value} ${step.delay_unit}` : 'Immediately'}
                                {step.condition === 'only_if_no_reply' ? ' • Only if no reply' : ''}
                              </span>
                            </div>
                            <p className="text-xs whitespace-pre-wrap break-words">{step.message_body}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => openEdit(auto)}>
                          <Pencil className="w-3 h-3" /> Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1 text-xs text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{auto.name}"?</AlertDialogTitle>
                              <AlertDialogDescription>This will permanently remove this custom automation and all its steps.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(auto.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAutomation.id ? 'Edit' : 'New'} Custom Automation</DialogTitle>
            <DialogDescription>Build a multi-step SMS sequence triggered by specific events.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Automation Name</Label>
              <Input
                placeholder="e.g. New Lead Follow-up"
                value={editingAutomation.name}
                onChange={(e) => setEditingAutomation(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {/* Trigger + Tag row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Select
                  value={editingAutomation.trigger_type}
                  onValueChange={(v) => setEditingAutomation(prev => ({ ...prev, trigger_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tag Filter (optional)</Label>
                <Select
                  value={editingAutomation.tag_filter}
                  onValueChange={(v) => setEditingAutomation(prev => ({ ...prev, tag_filter: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Clients" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_FILTERS.map(t => (
                      <SelectItem key={t.value} value={t.value || '_none_'}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Override notice */}
            {TRIGGER_TO_DEFAULT[editingAutomation.trigger_type] && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                <Power className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <span className="text-muted-foreground">
                  This trigger matches a default automation. When active, the default will be paused automatically.
                </span>
              </div>
            )}

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Message Steps</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1 text-xs">
                  <Plus className="w-3 h-3" /> Add Step
                </Button>
              </div>

              {editingAutomation.steps.map((step, idx) => (
                <div key={idx} className="p-3 border rounded-lg space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      <span className="text-sm font-medium">Step {idx + 1}</span>
                    </div>
                    {editingAutomation.steps.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Delay</Label>
                      <Input
                        type="number"
                        min={0}
                        value={step.delay_value}
                        onChange={(e) => updateStep(idx, 'delay_value', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit</Label>
                      <Select value={step.delay_unit} onValueChange={(v) => updateStep(idx, 'delay_unit', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="min">Minutes</SelectItem>
                          <SelectItem value="hr">Hours</SelectItem>
                          <SelectItem value="days">Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Condition</Label>
                      <Select value={step.condition} onValueChange={(v) => updateStep(idx, 'condition', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="always">Always Send</SelectItem>
                          <SelectItem value="only_if_no_reply">Only If No Reply</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Message</Label>
                    <Textarea
                      placeholder="Hi {client_name}, ..."
                      value={step.message_body}
                      onChange={(e) => updateStep(idx, 'message_body', e.target.value)}
                      rows={3}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Merge tags: {"{client_name}"} {"{booking_date}"} {"{booking_link}"} {"{review_link}"}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Start sending messages when trigger fires</p>
              </div>
              <Switch
                checked={editingAutomation.is_active}
                onCheckedChange={(checked) => setEditingAutomation(prev => ({ ...prev, is_active: checked }))}
              />
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingAutomation.id ? 'Update Automation' : 'Create Automation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Export for template imports
export { TRIGGERS, TAG_FILTERS, emptyStep };
export type { CustomAutomation, Step };
