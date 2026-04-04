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

interface StaffPayoutSetupProps {
  staffId: string;
  organizationId: string;
}

export function StaffPayoutSetup({ staffId, organizationId }: StaffPayoutSetupProps) {
  const queryClient = useQueryClient();
  const [isRedirecting, setIsRedirecting] = useState(false);

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
  const { data: liveStatus } = useQuery({
    queryKey: ['staff-payout-status', staffId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-staff-payout-status', {
        body: { staffId, organizationId },
      });
      if (error) throw error;
      // Also update the cached query so UI stays in sync
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
    // Only start after cache has loaded to avoid blocking render
    enabled: !isCacheLoading,
  });

  // Use cached data first, override with live data when available
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

  // Detect return from Stripe onboarding via window focus
  useEffect(() => {
    const handleFocus = () => {
      if (isRedirecting) {
        setIsRedirecting(false);
        refetch();
        queryClient.invalidateQueries({ queryKey: ['onboarding-payout', staffId, organizationId] });
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isRedirecting, refetch, queryClient, staffId, organizationId]);

  // Start or resume Stripe Connect onboarding
  // IMPORTANT: Open window synchronously on click to avoid Safari popup blocker
  const startOnboarding = useMutation({
    mutationFn: async (newWindow: Window | null) => {
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

      return { ...(data as { url: string; accountId: string }), newWindow };
    },
    onSuccess: (data) => {
      if (data.url) {
        setIsRedirecting(true);
        if (data.newWindow && !data.newWindow.closed) {
          data.newWindow.location.href = data.url;
        } else {
          // Fallback: redirect current page
          window.location.href = data.url;
        }
        toast.success('Opening payout setup. Complete the form and return here.');
      }
    },
    onError: (error: any, newWindow) => {
      // Close the blank tab if the call failed
      if (newWindow && !newWindow.closed) {
        newWindow.close();
      }
      if (!error.message?.includes('org_stripe_not_connected')) {
        toast.error(error.message || 'Failed to start payout setup');
      }
    },
  });

  const handleStartOnboarding = () => {
    // Open blank window synchronously (within click handler) so Safari allows it
    const newWindow = window.open('about:blank', '_blank');
    startOnboarding.mutate(newWindow);
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
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
                disabled={startOnboarding.isPending || isRedirecting}
              >
                {startOnboarding.isPending || isRedirecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Update Bank Account
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
                    Your employer has not connected their payment account yet. Please contact your employer to set up payments before you can configure payouts.
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

              {isRedirecting && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-center">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                  Complete the setup in the new tab, then return here. Status will update automatically.
                </div>
              )}

              <Button
                className="w-full"
                onClick={() => startOnboarding.mutate()}
                disabled={startOnboarding.isPending || isRedirecting}
                size="lg"
              >
                {startOnboarding.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Banknote className="w-4 h-4 mr-2" />
                )}
                {isOnboarding ? 'Complete Payout Setup' : 'Set Up Payouts'}
              </Button>
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
