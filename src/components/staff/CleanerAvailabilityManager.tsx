import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Clock, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';

interface WorkingHour {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2);
  const minute = i % 2 === 0 ? '00' : '30';
  const ampm = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return {
    value: `${hour.toString().padStart(2, '0')}:${minute}:00`,
    label: `${displayHour}:${minute} ${ampm}`,
  };
});

interface Props {
  staffId: string;
}

export function CleanerAvailabilityManager({ staffId }: Props) {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch existing working hours
  // NOTE: The `working_hours` table does not have `organization_id`.
  // Org isolation is enforced via RLS (through staff/org_memberships).
  const { data: existingHours, isLoading } = useQuery({
    queryKey: ['working-hours', staffId, organizationId],
    queryFn: async () => {
      // Use type workaround for Supabase deep type inference
      const client: any = supabase;
      const { data, error } = await client
        .from('working_hours')
        .select('*')
        .eq('staff_id', staffId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!staffId,
  });

  // Initialize working hours
  useEffect(() => {
    if (existingHours) {
      // Create a full week with existing data or defaults
      const fullWeek: WorkingHour[] = DAYS.map((_, index) => {
        const existing = existingHours.find((h) => h.day_of_week === index);
        return existing || {
          day_of_week: index,
          start_time: '09:00:00',
          end_time: '17:00:00',
          is_available: index !== 0 && index !== 6, // Default: weekdays available
        };
      });
      setWorkingHours(fullWeek);
    }
  }, [existingHours]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Use type workaround for Supabase deep type inference
      const client: any = supabase;

      // Delete existing and insert new
      const { error: deleteError } = await client
        .from('working_hours')
        .delete()
        .eq('staff_id', staffId);

      if (deleteError) throw deleteError;

      const { error } = await client
        .from('working_hours')
        .insert(
          workingHours.map((h) => ({
            staff_id: staffId,
            day_of_week: h.day_of_week,
            start_time: h.start_time,
            end_time: h.end_time,
            is_available: h.is_available,
          }))
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['working-hours', staffId, organizationId] });
      toast.success('Availability saved!');
      setHasChanges(false);
    },
    onError: (error) => {
      console.error('Error saving availability:', error);
      toast.error('Failed to save availability');
    },
  });

  const updateDay = (dayIndex: number, field: keyof WorkingHour, value: string | boolean) => {
    setWorkingHours((prev) =>
      prev.map((h) =>
        h.day_of_week === dayIndex ? { ...h, [field]: value } : h
      )
    );
    setHasChanges(true);
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading availability...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Your Availability
        </CardTitle>
        <CardDescription>
          Set your working hours. Jobs will only be assigned to you during your available times.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {workingHours.map((day) => (
          <div
            key={day.day_of_week}
            className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border ${
              day.is_available ? 'bg-card' : 'bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-[140px]">
              <Switch
                checked={day.is_available}
                onCheckedChange={(checked) => updateDay(day.day_of_week, 'is_available', checked)}
              />
              <Label className="font-medium">{DAYS[day.day_of_week]}</Label>
            </div>
            
            {day.is_available && (
              <div className="flex items-center gap-2 flex-1">
                <Select
                  value={day.start_time}
                  onValueChange={(value) => updateDay(day.day_of_week, 'start_time', value)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">to</span>
                <Select
                  value={day.end_time}
                  onValueChange={(value) => updateDay(day.day_of_week, 'end_time', value)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((time) => (
                      <SelectItem key={time.value} value={time.value}>
                        {time.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ))}

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          className="w-full gap-2"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save Availability'}
        </Button>
      </CardContent>
    </Card>
  );
}
