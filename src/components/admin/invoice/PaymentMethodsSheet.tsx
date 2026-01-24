import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CreditCard, Building, FileText, DollarSign, Loader2, Banknote } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface PaymentMethodsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

interface PaymentSettings {
  accept_cards: boolean;
  accept_ach: boolean;
  accept_checks: boolean;
  accept_cash: boolean;
  accept_paypal: boolean;
  card_fee_percent: number;
  card_fee_fixed: number;
  ach_fee_percent: number;
  ach_fee_fixed: number;
  default_billable_hours: number;
}

export function PaymentMethodsSheet({ open, onOpenChange, organizationId }: PaymentMethodsSheetProps) {
  const queryClient = useQueryClient();
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ['invoice-settings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_invoice_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && open,
  });

  const [formData, setFormData] = useState<PaymentSettings>({
    accept_cards: true,
    accept_ach: true,
    accept_checks: false,
    accept_cash: false,
    accept_paypal: false,
    card_fee_percent: 2.9,
    card_fee_fixed: 0.30,
    ach_fee_percent: 0,
    ach_fee_fixed: 0,
    default_billable_hours: 5,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        accept_cards: settings.accept_cards ?? true,
        accept_ach: settings.accept_ach ?? true,
        accept_checks: settings.accept_checks ?? false,
        accept_cash: (settings as any).accept_cash ?? false,
        accept_paypal: settings.accept_paypal ?? false,
        card_fee_percent: settings.card_fee_percent ?? 2.9,
        card_fee_fixed: settings.card_fee_fixed ?? 0.30,
        ach_fee_percent: settings.ach_fee_percent ?? 0,
        ach_fee_fixed: settings.ach_fee_fixed ?? 0,
        default_billable_hours: (settings as any).default_billable_hours ?? 5,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        organization_id: organizationId,
        ...formData,
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('organization_invoice_settings')
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organization_invoice_settings')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-settings'] });
      toast.success('Payment settings saved');
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const PaymentMethod = ({ 
    icon: Icon, 
    name, 
    description,
    enabled,
    onToggle,
    feeLabel,
  }: { 
    icon: typeof CreditCard;
    name: string;
    description: string;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    feeLabel?: string;
  }) => (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
          {feeLabel && (
            <p className="text-xs text-primary mt-0.5">{feeLabel}</p>
          )}
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle>Payment Methods</SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="py-4 space-y-4 overflow-y-auto max-h-[calc(80vh-140px)]">
            <p className="text-sm text-muted-foreground">
              Choose which payment methods your customers can use to pay invoices.
            </p>

            <PaymentMethod
              icon={CreditCard}
              name="Debit/Credit Cards"
              description="Accept Visa, Mastercard, Amex via Stripe"
              enabled={formData.accept_cards}
              onToggle={(v) => setFormData({ ...formData, accept_cards: v })}
              feeLabel={`${formData.card_fee_percent}% + $${formData.card_fee_fixed.toFixed(2)} per transaction`}
            />

            <PaymentMethod
              icon={Building}
              name="Bank Transfer (ACH)"
              description="Direct bank transfers"
              enabled={formData.accept_ach}
              onToggle={(v) => setFormData({ ...formData, accept_ach: v })}
              feeLabel="Free"
            />

            <PaymentMethod
              icon={FileText}
              name="Checks"
              description="Accept check payments"
              enabled={formData.accept_checks}
              onToggle={(v) => setFormData({ ...formData, accept_checks: v })}
            />

            <PaymentMethod
              icon={Banknote}
              name="Cash"
              description="Accept cash payments"
              enabled={formData.accept_cash}
              onToggle={(v) => setFormData({ ...formData, accept_cash: v })}
            />

            <PaymentMethod
              icon={DollarSign}
              name="PayPal"
              description="Accept PayPal payments"
              enabled={formData.accept_paypal}
              onToggle={(v) => setFormData({ ...formData, accept_paypal: v })}
            />

            {/* Fee Configuration */}
            {formData.accept_cards && (
              <div className="pt-4 border-t space-y-3">
                <p className="font-medium text-sm">Card Processing Fees</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Percent (%)</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={formData.card_fee_percent}
                      onChange={(e) => setFormData({ ...formData, card_fee_percent: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Fixed ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.card_fee_fixed}
                      onChange={(e) => setFormData({ ...formData, card_fee_fixed: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Default Billable Hours */}
            <div className="pt-4 border-t space-y-3">
              <p className="font-medium text-sm">Default Billable Hours</p>
              <p className="text-xs text-muted-foreground">Set the default hours when adding new line items to invoices</p>
              <Input
                type="number"
                step="0.5"
                min="0.5"
                value={formData.default_billable_hours}
                onChange={(e) => setFormData({ ...formData, default_billable_hours: parseFloat(e.target.value) || 5 })}
                className="w-32"
              />
            </div>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
          <Button 
            className="w-full" 
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
