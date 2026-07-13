import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Clock, AlertCircle, GripVertical } from 'lucide-react';
import {
  type ArrivalWindow,
  type SchedulingMode,
  formatWindowRange,
  formatWindowTime,
  windowDurationMinutes,
} from '@/hooks/useSchedulingMode';

function newWindow(sort_order: number): ArrivalWindow {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    label: '',
    start_time: '08:00',
    end_time: '10:00',
    sort_order,
    enabled: true,
  };
}

function durationLabel(min: number): string {
  if (min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export function SchedulingModeCard() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [mode, setMode] = useState<SchedulingMode>('specific');
  const [windows, setWindows] = useState<ArrivalWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('business_settings')
        .select('scheduling_mode, arrival_windows')
        .eq('organization_id', orgId)
        .maybeSingle();
      const rawMode = (data as { scheduling_mode?: string } | null)?.scheduling_mode;
      setMode(rawMode === 'arrival_window' ? 'arrival_window' : 'specific');
      const raw = (data as { arrival_windows?: unknown } | null)?.arrival_windows;
      const list = Array.isArray(raw) ? (raw as ArrivalWindow[]) : [];
      setWindows(list.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      setLoading(false);
    })();
  }, [orgId]);

  const enabledWindows = useMemo(() => windows.filter((w) => w.enabled), [windows]);
  const overlaps = useMemo(() => {
    const sorted = [...enabledWindows].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const set = new Set<string>();
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start_time < sorted[i - 1].end_time) {
        set.add(sorted[i].id);
        set.add(sorted[i - 1].id);
      }
    }
    return set;
  }, [enabledWindows]);

  const invalidIds = useMemo(() => {
    const s = new Set<string>();
    windows.forEach((w) => {
      if (w.end_time <= w.start_time) s.add(w.id);
      const dur = windowDurationMinutes(w);
      if (dur < 30 || dur > 12 * 60) s.add(w.id);
    });
    return s;
  }, [windows]);

  const update = (id: string, patch: Partial<ArrivalWindow>) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };
  const remove = (id: string) => setWindows((prev) => prev.filter((w) => w.id !== id));
  const add = () => setWindows((prev) => [...prev, newWindow(prev.length)]);
  const move = (index: number, dir: -1 | 1) => {
    setWindows((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next.map((w, i) => ({ ...w, sort_order: i }));
    });
  };

  const save = async () => {
    if (!orgId) return;
    if (invalidIds.size > 0) {
      toast.error('Fix invalid windows before saving (end must be after start, 30 min – 12 h).');
      return;
    }
    setSaving(true);
    const payload = windows.map((w, i) => ({ ...w, sort_order: i }));
    const { error } = await supabase
      .from('business_settings')
      .update({
        scheduling_mode: mode,
        arrival_windows: payload,
      } as never)
      .eq('organization_id', orgId);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success('Scheduling settings saved');
    qc.invalidateQueries({ queryKey: ['scheduling-mode', orgId] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" /> Scheduling Mode
        </CardTitle>
        <CardDescription>
          Choose how customers pick a time when they book. Applies to both the customer booking form and the admin New Booking form.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as SchedulingMode)}
          className="space-y-3"
          disabled={loading}
        >
          <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
            <RadioGroupItem value="specific" id="mode-specific" className="mt-1" />
            <div>
              <div className="font-medium">Specific Time Slots</div>
              <div className="text-sm text-muted-foreground">
                Customers see exact start times pulled from your availability (e.g. 9:00 AM, 9:30 AM, 10:00 AM).
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
            <RadioGroupItem value="arrival_window" id="mode-window" className="mt-1" />
            <div>
              <div className="font-medium">Arrival Windows</div>
              <div className="text-sm text-muted-foreground">
                Customers pick a time block (e.g. 8:00 AM – 10:00 AM). Your team arrives anywhere within the window.
              </div>
            </div>
          </label>
        </RadioGroup>

        {mode === 'arrival_window' && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Arrival Windows</div>
                <div className="text-xs text-muted-foreground">
                  Drag to reorder — customers see them in this order.
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={add}>
                <Plus className="h-4 w-4 mr-1" /> Add Window
              </Button>
            </div>

            {windows.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                No arrival windows yet. Add at least one, or customers will see specific times instead.
              </div>
            )}

            <div className="space-y-2">
              {windows.map((w, i) => {
                const dur = windowDurationMinutes(w);
                const invalid = invalidIds.has(w.id);
                const overlap = overlaps.has(w.id);
                return (
                  <div
                    key={w.id}
                    className={`rounded-lg border p-3 space-y-2 ${invalid ? 'border-destructive/60' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="h-4 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          aria-label="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="h-4 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          onClick={() => move(i, 1)}
                          disabled={i === windows.length - 1}
                          aria-label="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <Input
                        value={w.label ?? ''}
                        placeholder="Label (optional, e.g. Morning)"
                        maxLength={40}
                        onChange={(e) => update(w.id, { label: e.target.value })}
                        className="max-w-[220px]"
                      />
                      <div className="flex-1" />
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Enabled</Label>
                        <Switch checked={w.enabled} onCheckedChange={(v) => update(w.id, { enabled: v })} />
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => remove(w.id)} aria-label="Delete window">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div>
                        <Label className="text-xs">Start</Label>
                        <Input
                          type="time"
                          step={900}
                          value={w.start_time}
                          onChange={(e) => update(w.id, { start_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">End</Label>
                        <Input
                          type="time"
                          step={900}
                          value={w.end_time}
                          onChange={(e) => update(w.id, { end_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Duration</Label>
                        <div className="h-10 flex items-center px-3 rounded-md border bg-muted/40 text-sm">
                          {durationLabel(dur)}
                        </div>
                      </div>
                    </div>
                    {invalid && (
                      <div className="text-xs text-destructive">
                        End time must be after start, and duration between 30 min and 12 h.
                      </div>
                    )}
                    {!invalid && overlap && (
                      <div className="text-xs text-amber-600">
                        This window overlaps another enabled window.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Separator />

        <div>
          <div className="text-sm font-semibold mb-2">Customer preview</div>
          {mode === 'arrival_window' ? (
            enabledWindows.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {enabledWindows.map((w) => (
                  <div
                    key={w.id}
                    className="rounded-lg border px-3 py-2 text-sm min-w-[140px] text-center bg-background"
                  >
                    <div className="font-medium">{formatWindowRange(w)}</div>
                    {w.label && <div className="text-xs text-muted-foreground">{w.label}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No enabled windows — customers will see specific times as a fallback.
              </div>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              {['09:00', '09:30', '10:00', '10:30', '11:00'].map((t) => (
                <Badge key={t} variant="secondary">{formatWindowTime(t)}</Badge>
              ))}
              <span className="text-xs text-muted-foreground self-center">Actual times depend on availability.</span>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save Scheduling Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
