import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { getDayName, getEndDay, type PayrollPeriodConfig, DEFAULT_PAYROLL_CONFIG } from '@/lib/payrollPeriod';
import { Settings, Save, Mail, Send, Loader2 } from 'lucide-react';

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

interface ReportSettings {
  payroll_report_email_enabled: boolean;
  payroll_report_recipients: string[];
  payroll_report_send_hour: number;
}

const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  payroll_report_email_enabled: true,
  payroll_report_recipients: [],
  payroll_report_send_hour: 20,
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
  const ampm = i < 12 ? 'AM' : 'PM';
  return { value: i, label: `${h12}:00 ${ampm}` };
});

export function PayrollPeriodSettings() {
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();

  const { data: savedConfig } = useQuery({
    queryKey: ['payroll-period-config', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        return {
          ...DEFAULT_PAYROLL_CONFIG,
          ...DEFAULT_REPORT_SETTINGS,
        };
      }
      const { data, error } = await supabase
        .from('business_settings')
        .select(
          'payroll_frequency, payroll_start_day, payroll_custom_days, ' +
            'payroll_report_email_enabled, payroll_report_recipients, payroll_report_send_hour'
        )
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        payroll_frequency: (row.payroll_frequency as 'weekly' | 'biweekly') || 'weekly',
        payroll_start_day: (row.payroll_start_day as number | null) ?? 1,
        payroll_custom_days: (row.payroll_custom_days as number[] | null) || null,
        payroll_report_email_enabled:
          (row.payroll_report_email_enabled as boolean | null) ?? true,
        payroll_report_recipients:
          (row.payroll_report_recipients as string[] | null) ?? [],
        payroll_report_send_hour:
          (row.payroll_report_send_hour as number | null) ?? 20,
      } as PayrollPeriodConfig & ReportSettings;
    },
    enabled: !!organizationId,
  });

  const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly');
  const [startDay, setStartDay] = useState(1);
  const [useCustomDays, setUseCustomDays] = useState(false);
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [reportEnabled, setReportEnabled] = useState(true);
  const [sendHour, setSendHour] = useState(20);
  const [recipientsText, setRecipientsText] = useState('');

  useEffect(() => {
    if (savedConfig) {
      setFrequency(savedConfig.payroll_frequency as 'weekly' | 'biweekly');
      setStartDay(savedConfig.payroll_start_day);
      setUseCustomDays(!!savedConfig.payroll_custom_days);
      if (savedConfig.payroll_custom_days) {
        setCustomDays(savedConfig.payroll_custom_days);
      }
      setReportEnabled(savedConfig.payroll_report_email_enabled);
      setSendHour(savedConfig.payroll_report_send_hour);
      setRecipientsText((savedConfig.payroll_report_recipients ?? []).join(', '));
    }
  }, [savedConfig]);

  const endDay = getEndDay({
    payroll_frequency: frequency,
    payroll_start_day: startDay,
    payroll_custom_days: null,
  });

  const parsedRecipients = recipientsText
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const invalidRecipients = parsedRecipients.filter(
    (e) => !/^\S+@\S+\.\S+$/.test(e)
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');
      if (invalidRecipients.length > 0) {
        throw new Error(`Invalid email addresses: ${invalidRecipients.join(', ')}`);
      }
      const { error } = await supabase
        .from('business_settings')
        .update({
          payroll_frequency: frequency,
          payroll_start_day: startDay,
          payroll_custom_days:
            frequency === 'weekly' && useCustomDays ? customDays : null,
          payroll_report_email_enabled: reportEnabled,
          payroll_report_send_hour: sendHour,
          payroll_report_recipients: parsedRecipients,
        } as never)
        .eq('organization_id', organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-period-config'] });
      queryClient.invalidateQueries({ queryKey: ['forecast-bookings'] });
      toast.success('Settings saved');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save settings'),
  });

  const sendNowMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');
      const { data, error } = await supabase.functions.invoke(
        'admin-trigger-payroll-report',
        { body: { organization_id: organizationId } }
      );
      if (error) throw error;
      if (data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || 'Failed to send report');
      }
      return data as {
        period_label?: string;
        recipients?: string[];
        skipped?: string;
      };
    },
    onSuccess: (data) => {
      if (data?.skipped) {
        toast.info(`Report skipped: ${data.skipped.replaceAll('_', ' ')}`);
        return;
      }
      const recipients = data?.recipients?.join(', ') ?? 'recipients';
      toast.success(`Report sent to ${recipients}${data?.period_label ? ` for ${data.period_label}` : ''}`);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to send report'),
  });

  const toggleCustomDay = (day: number) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
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
              onClick={() => {
                setFrequency('biweekly');
                setUseCustomDays(false);
              }}
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
            {DAYS.map((d) => (
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
                {DAYS.map((d) => (
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

        {/* Email reports section */}
        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <h3 className="text-sm font-medium">Email reports</h3>
              <p className="text-xs text-muted-foreground">
                Get a payroll summary emailed when each period closes.
              </p>
            </div>
            <Switch
              checked={reportEnabled}
              onCheckedChange={setReportEnabled}
              aria-label="Enable payroll period reports"
            />
          </div>

          {reportEnabled && (
            <div className="space-y-4 pl-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Preferred send time</label>
                <Select
                  value={String(sendHour)}
                  onValueChange={(v) => setSendHour(Number(v))}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((h) => (
                      <SelectItem key={h.value} value={String(h.value)}>
                        {h.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reports currently send daily around 8 PM ET. Per-org send times
                  will be honored when the hourly cron is enabled.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Additional recipients</label>
                <Textarea
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                  placeholder="bookkeeper@example.com, accountant@example.com"
                  rows={2}
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Comma- or newline-separated. The org owner is always included.
                </p>
                {invalidRecipients.length > 0 && (
                  <p className="text-xs text-destructive">
                    Invalid: {invalidRecipients.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-6">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || invalidRecipients.length > 0}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button
            variant="outline"
            onClick={() => sendNowMutation.mutate()}
            disabled={sendNowMutation.isPending || !reportEnabled}
            className="gap-2"
            title={
              reportEnabled
                ? 'Send the report for the most recent completed period'
                : 'Enable email reports to send'
            }
          >
            {sendNowMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendNowMutation.isPending ? 'Sending...' : 'Send report now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
