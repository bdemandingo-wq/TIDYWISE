import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PayoutRequirementsBannerProps {
  staffId: string;
  organizationId: string;
  onNavigateToPayouts: () => void;
}

export function PayoutRequirementsBanner({ staffId, organizationId, onNavigateToPayouts }: PayoutRequirementsBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const { data: payoutAccount } = useQuery({
    queryKey: ['staff-payout-banner', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_payout_accounts')
        .select('payouts_enabled, details_submitted, account_status, requirements_currently_due, requirements_pending_verification, disabled_reason')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!payoutAccount) return null;
  if (payoutAccount.payouts_enabled) return null;
  if (!payoutAccount.details_submitted && payoutAccount.account_status === 'not_started') return null;

  const currentlyDue = (payoutAccount.requirements_currently_due as string[] | null) || [];
  const pendingVerification = (payoutAccount.requirements_pending_verification as string[] | null) || [];
  const hasPastDue = !!payoutAccount.disabled_reason;
  const hasActionRequired = currentlyDue.length > 0 || hasPastDue;
  const isPendingOnly = !hasActionRequired && pendingVerification.length > 0;

  // Don't show banner if only pending verification (info only, no action needed)
  if (isPendingOnly) return null;

  // Past due banners cannot be dismissed
  const canDismiss = !hasPastDue;
  if (dismissed && canDismiss) return null;

  return (
    <div className={`mb-4 p-3 rounded-lg border flex items-center gap-3 ${
      hasPastDue 
        ? 'bg-destructive/10 border-destructive/30 text-destructive' 
        : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400'
    }`}>
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">
          {hasPastDue ? '⚠️ Your payouts are paused' : '⚠️ Finish your payout setup'}
        </p>
        <p className="text-xs opacity-80">
          {hasPastDue 
            ? 'Complete your setup now to start receiving your earnings.' 
            : 'A few more steps are needed to activate your payouts.'}
        </p>
      </div>
      <Button
        size="sm"
        variant={hasPastDue ? 'destructive' : 'outline'}
        className="shrink-0 gap-1 min-h-[36px]"
        onClick={onNavigateToPayouts}
      >
        Complete Setup
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
      {canDismiss && (
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded hover:bg-foreground/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
