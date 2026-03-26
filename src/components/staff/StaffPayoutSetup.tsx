import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Banknote, ExternalLink, CheckCircle2, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface StaffPayoutSetupProps {
  staffId: string;
  organizationId: string;
}

export function StaffPayoutSetup({ staffId, organizationId }: StaffPayoutSetupProps) {
  const queryClient = useQueryClient();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Check current payout status
  const { data: payoutStatus, isLoading } = useQuery({
    queryKey: ['staff-payout-status', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-staff-payout-status', {
        body: { staffId, organizationId },
      });
      if (error) throw error;
      return data as {
        status: string;
        payoutsEnabled: boolean;
        chargesEnabled: boolean;
        detailsSubmitted: boolean;
        bankLast4: string | null;
        accountHolderName: string | null;
      };
    },
    refetchInterval: 30000, // Refresh every 30s to catch onboarding completion
  });

  // Start or resume Stripe Connect onboarding
  const startOnboarding = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-staff-connect-account', {
        body: {
          staffId,
          organizationId,
          returnUrl: window.location.origin,
        },
      });

      if (error) {
        const edgeError = (data as { error?: string } | null)?.error;
        throw new Error(edgeError || error.message || 'Failed to start payout setup');
      }

      if (!data?.url) {
        throw new Error('No onboarding link was returned. Please try again.');
      }

      return data as { url: string; accountId: string };
    },
    onSuccess: (data) => {
      if (data.url) {
        setIsRedirecting(true);
        window.open(data.url, '_blank');
        toast.success('Opening payout setup in a new tab');
        // Refresh status after a delay
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['staff-payout-status', staffId, organizationId] });
          setIsRedirecting(false);
        }, 5000);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start payout setup');
    },
  });

  const getStatusBadge = () => {
    if (!payoutStatus) return null;
    
    switch (payoutStatus.status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
      case 'pending_verification':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending Verification</Badge>;
      case 'onboarding':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><AlertCircle className="w-3 h-3 mr-1" />Setup Incomplete</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Not Set Up</Badge>;
    }
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

  const isSetUp = payoutStatus?.status === 'active';
  const isOnboarding = payoutStatus?.status === 'onboarding';
  const isPending = payoutStatus?.status === 'pending_verification';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Banknote className="w-5 h-5" />
          Payout Setup
        </h2>
        <p className="text-sm text-muted-foreground">Set up your bank account for direct payouts</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Payment Account</CardTitle>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSetUp ? (
            <>
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="font-medium">Payouts Active</p>
                    <p className="text-sm text-muted-foreground">
                      Your bank account is connected and payouts are enabled.
                    </p>
                  </div>
                </div>
              </div>

              {payoutStatus.bankLast4 && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="text-sm text-muted-foreground">Bank Account</p>
                    <p className="font-medium">•••• •••• •••• {payoutStatus.bankLast4}</p>
                  </div>
                  <Banknote className="w-5 h-5 text-muted-foreground" />
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => startOnboarding.mutate()}
                disabled={startOnboarding.isPending || isRedirecting}
              >
                {startOnboarding.isPending || isRedirecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Update Payment Info
              </Button>
            </>
          ) : isPending ? (
            <>
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-3">
                  <Clock className="w-8 h-8 text-yellow-500" />
                  <div>
                    <p className="font-medium">Verification Pending</p>
                    <p className="text-sm text-muted-foreground">
                      Your details have been submitted. Verification usually takes 1-2 business days.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['staff-payout-status', staffId, organizationId] })}
              >
                Refresh Status
              </Button>
            </>
          ) : (
            <>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <p className="text-sm text-muted-foreground mb-3">
                  {isOnboarding
                    ? "You started the payout setup but didn't finish. Continue where you left off."
                    : "Set up your bank account to receive direct payouts for your work. This is a secure process powered by Stripe."}
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    Bank-level security
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    Your info is never shared with your employer
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-green-500" />
                    Takes about 5 minutes to complete
                  </li>
                </ul>
              </div>

              <Button
                className="w-full"
                onClick={() => startOnboarding.mutate()}
                disabled={startOnboarding.isPending || isRedirecting}
                size="lg"
              >
                {startOnboarding.isPending || isRedirecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Banknote className="w-4 h-4 mr-2" />
                )}
                {isOnboarding ? 'Continue Payout Setup' : 'Set Up Payouts'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
