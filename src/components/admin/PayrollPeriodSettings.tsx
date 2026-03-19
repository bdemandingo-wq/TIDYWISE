import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { getDayName, getEndDay, type PayrollPeriodConfig, DEFAULT_PAYROLL_CONFIG } from '@/lib/payrollPeriod';
import { Settings, Save } from 'lucide-react';

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function PayrollPeriodSettings() {
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();

  const { data: savedConfig } = useQuery({
    queryKey: ['payroll-period-config', organizationId],
    queryFn: async () => {
      if (!organizationId) return DEFAULT_PAYROLL_CONFIG;
      const { data, error } = await supabase
        .from('business_settings')
        .select('payroll_frequency, payroll_start_day, payroll_custom_days')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PAYROLL_CONFIG;
      return {
        payroll_frequency: (data as any).payroll_frequency || 'weekly',
        payroll_start_day: (data as any).payroll_start_day ?? 1,
        payroll_custom_days: (data as any).payroll_custom_days || null,
      } as PayrollPeriodConfig;
    },
    enabled: !!organizationId,
  });

  const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly');
  const [startDay, setStartDay] = useState(1);
  const [useCustomDays, setUseCustomDays] = useState(false);
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useEffect(() => {
    if (savedConfig) {
      setFrequency(savedConfig.payroll_frequency as 'weekly' | 'biweekly');
      setStartDay(savedConfig.payroll_start_day);
      setUseCustomDays(!!savedConfig.payroll_custom_days);
      if (savedConfig.payroll_custom_days) {
        setCustomDays(savedConfig.payroll_custom_days);
      }
    }
  }, [savedConfig]);

  const endDay = getEndDay({ payroll_frequency: frequency, payroll_start_day: startDay, payroll_custom_days: null });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');
      const { error } = await supabase
        .from('business_settings')
        .update({
          payroll_frequency: frequency,
          payroll_start_day: startDay,
          payroll_custom_days: (frequency === 'weekly' && useCustomDays) ? customDays : null,
        } as any)
        .eq('organization_id', organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-period-config'] });
      queryClient.invalidateQueries({ queryKey: ['forecast-bookings'] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const toggleCustomDay = (day: number) => {
    setCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Payroll Period Settings</CardTitle>
            <CardDescription>Configure how payroll periods are calculated</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Frequency Toggle */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Pay Frequency</label>
          <div className="flex rounded-lg border bg-muted p-1 w-fit">
            <button
              onClick={() => setFrequency('weekly')}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                frequency === 'weekly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Weekly
            </button>
            <button
              onClick={() => { setFrequency('biweekly'); setUseCustomDays(false); }}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                frequency === 'biweekly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Bi-Weekly
            </button>
          </div>
        </div>

        {/* Start Day Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Period Start Day</label>
          <div className="flex gap-1 flex-wrap">
            {DAYS.map(d => (
              <button
                key={d.value}
                onClick={() => setStartDay(d.value)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                  startDay === d.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-accent'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Period ends:</span>
            <Badge variant="secondary">
              {getDayName(endDay, true)}
              {frequency === 'biweekly' && ' (14 days)'}
              {frequency === 'weekly' && ' (7 days)'}
            </Badge>
          </div>
        </div>

        {/* Custom Days (Weekly only) */}
        {frequency === 'weekly' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={useCustomDays}
                onCheckedChange={(v) => setUseCustomDays(!!v)}
                id="custom-work-week"
              />
              <label htmlFor="custom-work-week" className="text-sm font-medium cursor-pointer">
                Custom work week (exclude weekend days)
              </label>
            </div>
            {useCustomDays && (
              <div className="flex gap-1 flex-wrap pl-6">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => toggleCustomDay(d.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                      customDays.includes(d.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:bg-accent'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
