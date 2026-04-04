import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Banknote, ExternalLink, CheckCircle2, Clock, AlertCircle, ShieldCheck, RefreshCw, History } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSearchParams } from 'react-router-dom';

interface StaffPayoutSetupProps {
  staffId: string;
  organizationId: string;
}

const PRODUCTION_BASE = 'https://jointidywise.com';

function mapErrorMessage(raw: string): string {
  if (raw.includes('org_stripe_not_connected') || raw.includes('Stripe not configured')) {
    return "Your employer needs to connect their payment account first. Please ask them to go to Settings → Payment Setup.";
  }
  if (raw.includes('Staff record not found') || raw.includes('access denied')) {
    return "Account verification failed. Please sign out and sign back in.";
  }
  if (raw.includes('Organization mismatch')) {
    return "There's an account configuration issue. Please contact your employer.";
  }
  if (raw.includes('No onboarding link')) {
    return "Payout setup failed to start. Please try again or contact support.";
  }
  return raw;
}

export function StaffPayoutSetup({ staffId, organizationId }: StaffPayoutSetupProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [isCheckingReturn, setIsCheckingReturn] = useState(false);

  // Detect return from Stripe onboarding via URL params
  const setupComplete = searchParams.get('setup') === 'complete' || searchParams.get('payout') === 'success';

  // Instant load from local DB cache (no edge function, no Stripe API)
  const { data: cachedStatus, isLoading: isCacheLoading } = useQuery({
    queryKey: ['staff-payout-cached', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_payout_accounts')
        .select('*')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        status: data.account_status || 'not_started',
        payoutsEnabled: data.payouts_enabled || false,
        chargesEnabled: data.charges_enabled || false,
        detailsSubmitted: data.details_submitted || false,
        bankLast4: data.bank_last4 || null,
        accountHolderName: data.account_holder_name || null,
      };
    },
  });

  // Background refresh from Stripe (runs after initial render, not blocking)
  const { data: liveStatus, isLoading: isLiveLoading } = useQuery({
    queryKey: ['staff-payout-status', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-staff-payout-status', {
        body: { staffId, organizationId },
      });
      if (error) throw error;
      queryClient.setQueryData(['staff-payout-cached', staffId, organizationId], data);
      return data as {
        status: string;
        payoutsEnabled: boolean;
        chargesEnabled: boolean;
        detailsSubmitted: boolean;
        bankLast4: string | null;
        accountHolderName: string | null;
      };
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    enabled: !isCacheLoading,
  });

  // If returning from Stripe setup, show checking state and force refresh
  useEffect(() => {
    if (setupComplete) {
      setIsCheckingReturn(true);
      // Force immediate refresh
      queryClient.invalidateQueries({ queryKey: ['staff-payout-status', staffId, organizationId] });
      queryClient.invalidateQueries({ queryKey: ['staff-payout-cached', staffId, organizationId] });
    }
  }, [setupComplete, staffId, organizationId, queryClient]);

  // Clear checking state once live data arrives
  useEffect(() => {
    if (isCheckingReturn && liveStatus && !isLiveLoading) {
      setIsCheckingReturn(false);
      if (liveStatus.payoutsEnabled) {
        toast.success('Payout setup complete! Your account is active.');
      } else if (liveStatus.detailsSubmitted) {
        toast.info('Details submitted. Verification is in progress.');
      }
    }
  }, [isCheckingReturn, liveStatus, isLiveLoading]);

  const payoutStatus = liveStatus || cachedStatus;
  const isLoading = isCacheLoading;

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['staff-payout-status', staffId, organizationId] });
    queryClient.invalidateQueries({ queryKey: ['staff-payout-cached', staffId, organizationId] });
  };

  // Fetch payout history from bookings
  const { data: payoutHistory = [] } = useQuery({
    queryKey: ['staff-payout-history', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, total_amount,
          cleaner_actual_payment, cleaner_wage, cleaner_wage_type,
          payment_status, status,
          customer:customers(first_name, last_name)
        `)
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .order('scheduled_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: payoutStatus?.status === 'active',
  });

  // Start or resume Stripe Connect onboarding
  const startOnboarding = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-staff-connect-account', {
        body: {
          staffId,
          organizationId,
          returnUrl: PRODUCTION_BASE,
        },
      });

      if (error) {
        // Try to extract error from response body
        const edgeError = (data as { error?: string; message?: string } | null)?.error 
          || (data as { error?: string; message?: string } | null)?.message;
        throw new Error(edgeError || error.message || 'Failed to start payout setup');
      }

      if (!data?.url) {
        throw new Error('No onboarding link was returned. Please try again.');
      }

      return data as { url: string; accountId: string };
    },
    onSuccess: (data) => {
      // Store URL in state so user can tap a direct button
      setOnboardingUrl(data.url);
      toast.success('Setup link ready! Tap the button below to continue.');
    },
    onError: (error: Error) => {
      const msg = mapErrorMessage(error.message);
      toast.error(msg, { duration: 6000 });
    },
  });

  // Direct redirect handler — called from a real user tap
  const handleOpenStripeSetup = () => {
    if (onboardingUrl) {
      window.location.href = onboardingUrl;
    }
  };

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

  if (isLoading || isCheckingReturn) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          {isCheckingReturn && (
            <p className="text-sm text-muted-foreground">Checking your setup status...</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const isOrgNotConnected = payoutStatus?.status === 'org_not_connected';
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
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => refetch()}
                title="Refresh status"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isSetUp ? (
            <>
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="font-medium">✅ Payout Account Connected</p>
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
                    <p className="font-medium">•••• {payoutStatus.bankLast4}</p>
                  </div>
                  <Banknote className="w-5 h-5 text-muted-foreground" />
                </div>
              )}

              {payoutStatus.accountHolderName && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="text-sm text-muted-foreground">Account Holder</p>
                    <p className="font-medium">{payoutStatus.accountHolderName}</p>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => startOnboarding.mutate()}
                disabled={startOnboarding.isPending}
              >
                {startOnboarding.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Update Bank Account
              </Button>

              {onboardingUrl && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleOpenStripeSetup}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Stripe Setup →
                </Button>
              )}
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
                onClick={() => refetch()}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Status
              </Button>
            </>
          ) : isOrgNotConnected ? (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-8 h-8 text-destructive" />
                <div>
                  <p className="font-medium">Payment Account Not Available</p>
                  <p className="text-sm text-muted-foreground">
                    Your employer hasn't connected their payment account yet. Please ask them to go to Settings → Payment Setup and connect their account before you can set up payouts.
                  </p>
                </div>
              </div>
            </div>
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

              {/* Step 1: Generate the setup link */}
              {!onboardingUrl && (
                <Button
                  className="w-full"
                  onClick={() => startOnboarding.mutate()}
                  disabled={startOnboarding.isPending}
                  size="lg"
                >
                  {startOnboarding.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Banknote className="w-4 h-4 mr-2" />
                  )}
                  {isOnboarding ? 'Continue Payout Setup' : 'Set Up Payouts'}
                </Button>
              )}

              {/* Step 2: Show prominent redirect button */}
              {onboardingUrl && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-center">
                    ✅ Setup link is ready! Tap the button below to continue.
                  </div>
                  <Button
                    className="w-full min-h-[52px] text-base font-semibold"
                    size="lg"
                    onClick={handleOpenStripeSetup}
                  >
                    <ExternalLink className="w-5 h-5 mr-2" />
                    Open Payout Setup →
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payout History */}
      {isSetUp && payoutHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Payout History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutHistory.map((booking: any) => {
                    const payAmount = booking.cleaner_actual_payment || booking.cleaner_wage || 0;
                    return (
                      <TableRow key={booking.id}>
                        <TableCell className="text-sm">
                          {format(new Date(booking.scheduled_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          #{booking.booking_number}
                        </TableCell>
                        <TableCell className="text-sm">
                          {booking.customer
                            ? `${booking.customer.first_name} ${booking.customer.last_name}`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">
                          ${payAmount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              booking.payment_status === 'paid'
                                ? 'bg-green-500/10 text-green-500 border-green-500/30'
                                : 'text-muted-foreground'
                            }
                          >
                            {booking.payment_status === 'paid' ? 'Paid' : booking.payment_status || 'Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
