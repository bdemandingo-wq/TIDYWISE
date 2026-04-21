import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface AdminPayoutResetSectionProps {
  staffId: string;
  staffName: string;
  organizationId: string;
  currentStatus: string | null;
}

const RESET_REASONS = [
  { value: 'changed_banks', label: 'Changed banks' },
  { value: 'wrong_account', label: 'Wrong account connected' },
  { value: 'verification_failed', label: 'Verification failed / account restricted' },
  { value: 'closed_account', label: 'Closed old bank account' },
  { value: 'admin_requested', label: 'Admin-requested reset' },
  { value: 'other', label: 'Other' },
];

export function AdminPayoutResetButton({ staffId, staffName, organizationId, currentStatus }: AdminPayoutResetSectionProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const isInProgress = currentStatus === 'pending_verification';

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('reset-stripe-connect', {
        body: { staffId, organizationId, reason, initiatedBy: 'admin' },
      });
      if (error) {
        let msg = 'Failed to reset';
        try {
          if ('context' in error && error.context instanceof Response) {
            const payload = await error.context.clone().json();
            msg = payload?.error || msg;
          }
        } catch { /* fallback */ }
        throw new Error(msg);
      }
      return data as { url: string; newAccountId: string };
    },
    onSuccess: (data) => {
      setShowConfirm(false);
      navigator.clipboard.writeText(data.url).then(() => {
        toast.success(`Reset complete for ${staffName}. New onboarding link copied to clipboard.`);
      }).catch(() => {
        toast.success(`Reset complete for ${staffName}. Send them to the Cleaner Portal to reconnect.`);
      });
      queryClient.invalidateQueries({ queryKey: ['stripe-connect-health', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['stripe-reset-history', organizationId] });
    },
    onError: (error: Error) => {
      toast.error(error.message, { duration: 6000 });
    },
  });

  if (!currentStatus || currentStatus === 'not_started') return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setShowConfirm(true)}
        disabled={isInProgress}
        title={isInProgress ? 'Setup in progress' : 'Reset payout setup'}
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Reset payout setup for {staffName}?
            </DialogTitle>
            <DialogDescription>
              This will disconnect their current bank account and create a fresh setup.
              The cleaner will receive an in-app notification to reconnect their bank account.
              Any pending payouts will be held until the new setup is complete.
            </DialogDescription>
          </DialogHeader>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Reason for reset</label>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Reset Setup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
