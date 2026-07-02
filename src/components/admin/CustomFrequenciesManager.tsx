import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Plus, Trash2, CalendarClock, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CustomFrequency {
  id: string;
  name: string;
  interval_days: number;
  is_active: boolean;
  days_of_week: number[] | null;
  discount_pct: number;
}

type FreqType = 'interval' | 'days';

export function CustomFrequenciesManager() {
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newDays, setNewDays] = useState('');
  const [newDiscount, setNewDiscount] = useState('0');
  const [freqType, setFreqType] = useState<FreqType>('interval');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDiscount, setEditDiscount] = useState('0');

  const { data: frequencies = [], isLoading } = useQuery({
    queryKey: ['custom-frequencies', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('custom_frequencies')
        .select('id, name, interval_days, is_active, days_of_week, discount_pct')
        .eq('organization_id', organizationId)
        .order('interval_days', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CustomFrequency[];
    },
    enabled: !!organizationId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['custom-frequencies'] });
    queryClient.invalidateQueries({ queryKey: ['custom-frequencies-active'] });
  };

  const clampDiscount = (raw: string): number => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > 99) return 99;
    return n;
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !newName.trim()) return;
      const discount_pct = clampDiscount(newDiscount);

      if (freqType === 'interval') {
        const days = parseInt(newDays, 10);
        if (!days || days <= 0) throw new Error('Days must be positive');
        const { error } = await supabase.from('custom_frequencies').insert({
          organization_id: organizationId,
          name: newName.trim(),
          interval_days: days,
          discount_pct,
        } as never);
        if (error) throw error;
      } else {
        if (selectedDays.length === 0) throw new Error('Select at least one day');
        const dayNums = selectedDays.map(Number).sort();
        const { error } = await supabase.from('custom_frequencies').insert({
          organization_id: organizationId,
          name: newName.trim(),
          interval_days: 7,
          days_of_week: dayNums,
          discount_pct,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      setNewName('');
      setNewDays('');
      setNewDiscount('0');
      setSelectedDays([]);
      toast.success('Custom frequency added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('custom_frequencies')
        .update({ is_active } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, discount_pct }: { id: string; name: string; discount_pct: number }) => {
      const { error } = await supabase
        .from('custom_frequencies')
        .update({ name, discount_pct } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast.success('Frequency updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_frequencies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Frequency deleted');
    },
  });

  const formatFreqLabel = (freq: CustomFrequency) => {
    if (freq.days_of_week && freq.days_of_week.length > 0) {
      return freq.days_of_week.map((d) => DAY_LABELS[d]).join(', ');
    }
    return `Every ${freq.interval_days} day${freq.interval_days !== 1 ? 's' : ''}`;
  };

  const startEdit = (freq: CustomFrequency) => {
    setEditingId(freq.id);
    setEditName(freq.name);
    setEditDiscount(String(freq.discount_pct ?? 0));
  };

  const isAddDisabled =
    !newName.trim() ||
    addMutation.isPending ||
    (freqType === 'interval' && !newDays) ||
    (freqType === 'days' && selectedDays.length === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          Custom Frequencies & Discounts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Create custom recurring intervals or specific day-of-week schedules with their own discount %. These appear as options in the booking form and apply the discount automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Type toggle */}
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Type:</Label>
          <ToggleGroup
            type="single"
            value={freqType}
            onValueChange={(v) => v && setFreqType(v as FreqType)}
            className="border rounded-lg"
          >
            <ToggleGroupItem value="interval" className="text-xs px-3">
              Every X Days
            </ToggleGroupItem>
            <ToggleGroupItem value="days" className="text-xs px-3">
              Specific Days
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Add new */}
        <div className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-sm">Name</Label>
              <Input
                placeholder={freqType === 'interval' ? 'e.g. Every 3 Days' : 'e.g. Mon/Wed/Fri'}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1"
              />
            </div>
            {freqType === 'interval' && (
              <div className="w-28">
                <Label className="text-sm">Interval (days)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  value={newDays}
                  onChange={(e) => setNewDays(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div className="w-28">
              <Label className="text-sm">Discount %</Label>
              <Input
                type="number"
                min="0"
                max="99"
                placeholder="0"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={isAddDisabled}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {freqType === 'days' && (
            <div>
              <Label className="text-sm mb-2 block">Select Days</Label>
              <ToggleGroup
                type="multiple"
                value={selectedDays}
                onValueChange={setSelectedDays}
                className="justify-start flex-wrap gap-1"
              >
                {DAY_LABELS.map((label, i) => (
                  <ToggleGroupItem
                    key={i}
                    value={String(i)}
                    className="w-12 h-9 text-xs border rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : frequencies.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No custom frequencies yet. Add one above.
          </p>
        ) : (
          <div className="space-y-2">
            {frequencies.map((freq) => {
              const isEditing = editingId === freq.id;
              return (
                <div
                  key={freq.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-secondary/20"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={freq.is_active}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: freq.id, is_active: checked })
                      }
                    />
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 flex-1 min-w-[140px]"
                        />
                        <Input
                          type="number"
                          min="0"
                          max="99"
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(e.target.value)}
                          className="h-8 w-24"
                        />
                        <span className="text-xs text-muted-foreground">% off</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{freq.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {formatFreqLabel(freq)}
                        </Badge>
                        {freq.discount_pct > 0 && (
                          <Badge variant="secondary" className="text-xs text-success">
                            {freq.discount_pct}% off
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary"
                          onClick={() =>
                            updateMutation.mutate({
                              id: freq.id,
                              name: editName.trim() || freq.name,
                              discount_pct: clampDiscount(editDiscount),
                            })
                          }
                          disabled={updateMutation.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEdit(freq)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(freq.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
