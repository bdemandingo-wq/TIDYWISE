import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface PayoutResetSectionProps {
  staffId: string;
  organizationId: string;
  currentStatus: string | null;
  chargesEnabled: boolean;
}

const RESET_REASONS = [
  { value: 'changed_banks', label: 'Changed banks' },
  { value: 'wrong_account', label: 'Wrong account connected' },
  { value: 'verification_failed', label: 'Verification failed / account restricted' },
  { value: 'closed_account', label: 'Closed old bank account' },
  { value: 'other', label: 'Other' },
];

export function PayoutResetSection({ staffId, organizationId, currentStatus, chargesEnabled }: PayoutResetSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const isInProgress = currentStatus === 'pending_verification';

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('reset-stripe-connect', {
        body: { staffId, organizationId, reason, initiatedBy: 'cleaner' },
      });
      if (error) {
        // Try to extract a meaningful message from the edge function response
        let msg = 'Failed to reset payout setup';
        try {
          if ('context' in error && error.context instanceof Response) {
            const payload = await error.context.clone().json();
            msg = payload?.error || msg;
          }
        } catch { /* use fallback */ }
        throw new Error(msg);
      }
      return data as { url: string; pendingAmount: number };
    },
    onSuccess: (data) => {
      setShowConfirm(false);
      toast.success('Payout setup reset. Redirecting to new setup...');
      queryClient.invalidateQueries({ queryKey: ['staff-payout-cached', staffId, organizationId] });
      queryClient.invalidateQueries({ queryKey: ['staff-payout-status', staffId, organizationId] });
      // Redirect to new Stripe onboarding
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast.error(error.message, { duration: 6000 });
    },
  });

  // Don't show if no account exists
  if (!currentStatus || currentStatus === 'not_started') return null;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between text-muted-foreground text-sm h-auto py-3">
            <span>Need to update your payout info?</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 pb-1">
          <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 space-y-3">
            <p className="text-sm text-muted-foreground">
              If you need to connect a different bank account or redo your payout setup, you can reset it here.
              This will require you to complete the setup process again.
            </p>
            <Button
              variant="outline"
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowConfirm(true)}
              disabled={isInProgress}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {isInProgress ? 'Setup in progress — cannot reset' : 'Reset Payout Setup'}
            </Button>
            {isInProgress && (
              <p className="text-xs text-yellow-500">
                Setup is currently being reviewed by Stripe. Please wait for it to complete or contact support.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Reset your payout setup?
            </DialogTitle>
            <DialogDescription>
              This will disconnect your current bank account and require you to complete setup again.
              Any pending payouts will be held until setup is complete. Are you sure?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reason for reset (optional)</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {RESET_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {chargesEnabled && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm">
                <p className="font-medium text-yellow-400">⚠️ Active account</p>
                <p className="text-muted-foreground mt-1">
                  Your current account is active with payouts enabled. Any in-flight payouts will be processed before the reset takes effect.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Yes, Reset Setup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
