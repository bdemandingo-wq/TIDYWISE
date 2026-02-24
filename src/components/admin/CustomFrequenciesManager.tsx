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
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CustomFrequency {
  id: string;
  name: string;
  interval_days: number;
  is_active: boolean;
  days_of_week: number[] | null;
}

type FreqType = 'interval' | 'days';

export function CustomFrequenciesManager() {
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newDays, setNewDays] = useState('');
  const [freqType, setFreqType] = useState<FreqType>('interval');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const { data: frequencies = [], isLoading } = useQuery({
    queryKey: ['custom-frequencies', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('custom_frequencies')
        .select('*')
        .eq('organization_id', organizationId)
        .order('interval_days', { ascending: true });
      if (error) throw error;
      return data as CustomFrequency[];
    },
    enabled: !!organizationId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId || !newName.trim()) return;

      if (freqType === 'interval') {
        const days = parseInt(newDays);
        if (!days || days <= 0) throw new Error('Days must be positive');
        const { error } = await supabase.from('custom_frequencies').insert({
          organization_id: organizationId,
          name: newName.trim(),
          interval_days: days,
        });
        if (error) throw error;
      } else {
        if (selectedDays.length === 0) throw new Error('Select at least one day');
        const dayNums = selectedDays.map(Number).sort();
        const { error } = await supabase.from('custom_frequencies').insert({
          organization_id: organizationId,
          name: newName.trim(),
          interval_days: 7, // weekly cycle
          days_of_week: dayNums,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-frequencies'] });
      setNewName('');
      setNewDays('');
      setSelectedDays([]);
      toast.success('Custom frequency added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('custom_frequencies')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-frequencies'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_frequencies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-frequencies'] });
      toast.success('Frequency deleted');
    },
  });

  const formatFreqLabel = (freq: CustomFrequency) => {
    if (freq.days_of_week && freq.days_of_week.length > 0) {
      return freq.days_of_week.map((d) => DAY_LABELS[d]).join(', ');
    }
    return `Every ${freq.interval_days} day${freq.interval_days !== 1 ? 's' : ''}`;
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
          Custom Frequencies
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Create custom recurring intervals or specific day-of-week schedules. These will appear in the booking form frequency dropdown.
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
          <div className="flex items-end gap-3">
            <div className="flex-1">
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
            {frequencies.map((freq) => (
              <div
                key={freq.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-secondary/20"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={freq.is_active}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: freq.id, is_active: checked })
                    }
                  />
                  <div>
                    <span className="font-medium text-sm">{freq.name}</span>
                    <Badge variant="outline" className="ml-2 text-xs">
                      {formatFreqLabel(freq)}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(freq.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
