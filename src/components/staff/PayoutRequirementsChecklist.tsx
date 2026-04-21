import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Clock, AlertTriangle, AlertCircle, ExternalLink, Banknote, ShieldCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';

interface PayoutRequirementsChecklistProps {
  staffId: string;
  organizationId: string;
}

const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.verification.document": "Upload a photo of your ID",
  "individual.verification.additional_document": "Upload an additional identity document",
  "individual.dob.day": "Provide your date of birth",
  "individual.dob.month": "Provide your date of birth",
  "individual.dob.year": "Provide your date of birth",
  "individual.first_name": "Provide your first name",
  "individual.last_name": "Provide your last name",
  "individual.ssn_last_4": "Provide the last 4 digits of your SSN",
  "individual.id_number": "Provide your SSN or government ID number",
  "individual.address.line1": "Provide your street address",
  "individual.address.city": "Provide your city",
  "individual.address.state": "Provide your state",
  "individual.address.postal_code": "Provide your ZIP code",
  "individual.email": "Provide your email address",
  "individual.phone": "Provide your phone number",
  "external_account": "Add a bank account for receiving payouts",
  "tos_acceptance.date": "Accept the Terms of Service",
  "tos_acceptance.ip": "Accept the Terms of Service",
  "business_profile.url": "Provide a business website or profile URL",
  "business_profile.mcc": "Select your business category",
};

function translateCode(code: string): string {
  return REQUIREMENT_LABELS[code] || code.replace(/[_.]/g, ' ');
}

function dedupeLabels(codes: string[]): string[] {
  const seen = new Set<string>();
  return codes.map(translateCode).filter(label => {
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
}

export function PayoutRequirementsChecklist({ staffId, organizationId }: PayoutRequirementsChecklistProps) {
  const queryClient = useQueryClient();
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // Check for resolved toast
  const { data: payoutAccount, isLoading } = useQuery({
    queryKey: ['staff-payout-requirements', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_payout_accounts')
        .select('payouts_enabled, details_submitted, account_status, requirements_currently_due, requirements_pending_verification, disabled_reason, payout_resolved_toast_shown, stripe_account_id')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Show one-time success toast when payouts become active
  useEffect(() => {
    if (payoutAccount?.payouts_enabled && !payoutAccount?.payout_resolved_toast_shown) {
      toast.success('🎉 You\'re all set — payouts are now active!', { duration: 6000 });
      // Mark toast as shown
      supabase
        .from('staff_payout_accounts')
        .update({ payout_resolved_toast_shown: true })
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['staff-payout-requirements'] });
        });
    }
  }, [payoutAccount?.payouts_enabled, payoutAccount?.payout_resolved_toast_shown, staffId, organizationId, queryClient]);

  const handleCompleteSetup = async () => {
    setIsGeneratingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-staff-connect-account', {
        body: {
          staffId,
          organizationId,
          returnUrl: 'https://jointidywise.com',
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No setup link returned');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start setup');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-payout-requirements'] });
    queryClient.invalidateQueries({ queryKey: ['staff-payout-cached'] });
    queryClient.invalidateQueries({ queryKey: ['staff-payout-status'] });
    queryClient.invalidateQueries({ queryKey: ['staff-payout-banner'] });
    toast.info('Refreshing status...');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!payoutAccount || !payoutAccount.stripe_account_id) return null;

  const currentlyDue = (payoutAccount.requirements_currently_due as string[] | null) || [];
  const pendingVerification = (payoutAccount.requirements_pending_verification as string[] | null) || [];
  const hasPastDue = !!payoutAccount.disabled_reason;
  const hasActionRequired = currentlyDue.length > 0 || hasPastDue;
  const isPendingOnly = !hasActionRequired && pendingVerification.length > 0;

  // Active — all good
  if (payoutAccount.payouts_enabled) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-500/10">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400">Your payouts are active</p>
              <p className="text-sm text-muted-foreground">Earnings are deposited automatically to your bank account.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pending verification only
  if (isPendingOnly) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" />
              Bank Verification In Progress
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-sm font-medium">🟡 Your bank is verifying your account</p>
            <p className="text-xs text-muted-foreground mt-1">
              This usually takes 2-3 business days — no action is needed from you.
            </p>
          </div>
          {pendingVerification.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Items being verified:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {dedupeLabels(pendingVerification).map((label, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Clock className="w-3 h-3 mt-0.5 text-yellow-500 shrink-0" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Action required
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {hasPastDue ? (
              <AlertTriangle className="w-4 h-4 text-destructive" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-500" />
            )}
            {hasPastDue ? 'Action Required — Payouts Paused' : 'Finish Your Payout Setup'}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`p-4 rounded-lg border ${
          hasPastDue 
            ? 'bg-destructive/10 border-destructive/20' 
            : 'bg-yellow-500/10 border-yellow-500/20'
        }`}>
          <p className="text-sm font-medium">
            {hasPastDue
              ? '🔴 Your payouts are on hold until you complete the following:'
              : '🟡 Almost there! Complete these items to start receiving your earnings:'}
          </p>
        </div>

        {/* Requirements checklist */}
        <div className="space-y-2">
          {dedupeLabels(currentlyDue).map((label, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded border bg-card">
              <AlertCircle className="w-4 h-4 mt-0.5 text-yellow-500 shrink-0" />
              <span className="text-sm">{label}</span>
            </div>
          ))}
          {hasPastDue && payoutAccount.disabled_reason && (
            <div className="flex items-start gap-2 p-2 rounded border bg-destructive/5">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
              <span className="text-sm">{payoutAccount.disabled_reason.replace(/[_.]/g, ' ')}</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <Button
          className="w-full min-h-[52px] text-base font-semibold"
          size="lg"
          onClick={handleCompleteSetup}
          disabled={isGeneratingLink}
        >
          {isGeneratingLink ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <ExternalLink className="w-5 h-5 mr-2" />
          )}
          Complete Setup →
        </Button>

        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
          Secure setup powered by Stripe — your info is never shared with your employer
        </div>
      </CardContent>
    </Card>
  );
}
