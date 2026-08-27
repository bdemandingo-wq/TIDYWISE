import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Percent, Save, Loader2, Info } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useRecurringDiscounts } from '@/hooks/useRecurringDiscounts';
import { QueryError } from '@/components/QueryError';

interface FormState {
  monthly: string;
  biweekly: string;
  weekly: string;
}

const ONE_TIME_PCT = 0; // Read-only, always 0.

export function RecurringDiscountSettingsCard() {
  const { organization, isAdmin } = useOrganization();
  const { config, loading, error: discountError, refetch } = useRecurringDiscounts();
  const [form, setForm] = useState<FormState>({
    monthly: '',
    biweekly: '',
    weekly: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  useEffect(() => {
    setForm({
      monthly: String(config.monthly),
      biweekly: String(config.biweekly),
      weekly: String(config.weekly),
    });
  }, [config.monthly, config.biweekly, config.weekly]);

  if (!isAdmin) return null;

  const validate = (state: FormState): typeof errors => {
    const next: typeof errors = {};
    (Object.keys(state) as Array<keyof FormState>).forEach((k) => {
      const raw = state[k].trim();
      const num = Number(raw);
      if (raw === '' || Number.isNaN(num)) {
        next[k] = 'Discount must be a number';
      } else if (num < 0 || num > 99) {
        next[k] = 'Discount must be between 0 and 99';
      }
    });
    return next;
  };

  const handleBlur = () => {
    setErrors(validate(form));
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const { error } = await supabase
        .from('business_settings')
        .upsert(
          {
            organization_id: organization.id,
            recurring_discount_one_time: ONE_TIME_PCT,
            recurring_discount_monthly: Number(form.monthly),
            recurring_discount_biweekly: Number(form.biweekly),
            recurring_discount_weekly: Number(form.weekly),
          } as never,
          { onConflict: 'organization_id' },
        );
      if (error) throw error;
      toast.success('Discount settings saved');
      refetch();
    } catch (err) {
      console.error('[RecurringDiscountSettings] save failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (discountError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Recurring Booking Discounts
          </CardTitle>
        </CardHeader>
        <CardContent><QueryError subject="recurring discount settings" onRetry={refetch} /></CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recurring Booking Discounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const rows: Array<{ key: keyof FormState | 'one_time'; label: string; readOnly?: boolean }> = [
    { key: 'one_time', label: 'One-Time', readOnly: true },
    { key: 'monthly', label: 'Monthly' },
    { key: 'biweekly', label: 'Bi-Weekly' },
    { key: 'weekly', label: 'Weekly' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="w-5 h-5" />
          Recurring Booking Discounts
        </CardTitle>
        <CardDescription>
          Set the percentage discount applied for each booking frequency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            These discounts apply automatically to recurring bookings starting
            from the second cleaning. The first cleaning is always charged at
            full price.
          </p>
        </div>

        <div className="grid grid-cols-[1fr,140px] gap-x-4 gap-y-3 max-w-md items-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Frequency
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground text-right">
            Discount %
          </div>
          {rows.map((r) => {
            if (r.key === 'one_time') {
              return (
                <div key="one_time" className="contents">
                  <Label className="font-medium">{r.label}</Label>
                  <div className="flex items-center justify-end gap-2 text-muted-foreground">
                    <Input
                      value="0"
                      readOnly
                      disabled
                      className="w-20 text-right tabular-nums"
                    />
                    <span>%</span>
                  </div>
                </div>
              );
            }
            const k = r.key;
            const err = errors[k];
            return (
              <div key={k} className="contents">
                <Label htmlFor={`rd-${k}`} className="font-medium">
                  {r.label}
                </Label>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      id={`rd-${k}`}
                      type="number"
                      min={0}
                      max={99}
                      step={1}
                      value={form[k]}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [k]: e.target.value }))
                      }
                      onBlur={handleBlur}
                      className={`w-20 text-right tabular-nums ${
                        err ? 'border-destructive' : ''
                      }`}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  {err && (
                    <span className="text-xs text-destructive">{err}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save discount settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
