import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, Clock, AlertCircle, AlertTriangle, RefreshCw, Loader2, Banknote, ExternalLink, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { StripeRequirementsWidget } from './StripeRequirementsWidget';

export function StripeConnectHealthPanel() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [refreshingStaffId, setRefreshingStaffId] = useState<string | null>(null);

  const { data: payoutAccounts = [], isLoading } = useQuery({
    queryKey: ['stripe-connect-health', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      // Get all payout accounts with staff names
      const { data: accounts, error: accountsError } = await supabase
        .from('staff_payout_accounts')
        .select('*, staff:staff(name, email, is_active)')
        .eq('organization_id', organization.id);

      if (accountsError) throw accountsError;
      return accounts || [];
    },
    enabled: !!organization?.id,
  });

  // Get all staff to show who hasn't started
  const { data: allStaff = [] } = useQuery({
    queryKey: ['all-staff-for-health', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, is_active')
        .eq('organization_id', organization.id)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const handleRefreshOne = async (staffId: string) => {
    setRefreshingStaffId(staffId);
    try {
      const { error } = await supabase.functions.invoke('check-staff-payout-status', {
        body: { staffId, organizationId: organization?.id },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['stripe-connect-health', organization?.id] });
      toast.success('Status refreshed');
    } catch (err: any) {
      toast.error('Failed to refresh: ' + (err.message || 'Unknown error'));
    } finally {
      setRefreshingStaffId(null);
    }
  };

  const handleRefreshAll = async () => {
    const accounts = payoutAccounts.filter((a: any) => a.stripe_account_id);
    if (accounts.length === 0) {
      toast.info('No accounts to refresh');
      return;
    }

    setRefreshingStaffId('all');
    let successCount = 0;
    for (const account of accounts) {
      try {
        await supabase.functions.invoke('check-staff-payout-status', {
          body: { staffId: account.staff_id, organizationId: organization?.id },
        });
        successCount++;
      } catch {
        // continue with others
      }
    }
    queryClient.invalidateQueries({ queryKey: ['stripe-connect-health', organization?.id] });
    toast.success(`Refreshed ${successCount}/${accounts.length} accounts`);
    setRefreshingStaffId(null);
  };

  const handleResendOnboardingLink = async (staffId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-staff-connect-account', {
        body: {
          staffId,
          organizationId: organization?.id,
          returnUrl: 'https://jointidywise.com',
        },
      });
      if (error) throw error;
      if (data?.url) {
        await navigator.clipboard.writeText(data.url);
        toast.success('Onboarding link copied to clipboard! Send it to the cleaner.');
      }
    } catch (err: any) {
      toast.error('Failed to generate link: ' + (err.message || 'Unknown error'));
    }
  };

  const staffWithAccounts = new Set(payoutAccounts.map((a: any) => a.staff_id));
  const staffWithoutAccounts = allStaff.filter((s: any) => !staffWithAccounts.has(s.id));

  const getStatusBadge = (account: any) => {
    switch (account.account_status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
      case 'pending_verification':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'onboarding':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Clock className="w-3 h-3 mr-1" />Incomplete</Badge>;
      default:
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Unknown</Badge>;
    }
  };

  const activeCount = payoutAccounts.filter((a: any) => a.account_status === 'active').length;
  const pendingCount = payoutAccounts.filter((a: any) => a.account_status === 'pending_verification').length;
  const onboardingCount = payoutAccounts.filter((a: any) => a.account_status === 'onboarding').length;
  const blockingCount = payoutAccounts.filter((a: any) => {
    const reqs = a.requirements_currently_due as any[];
    return reqs && reqs.length > 0;
  }).length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5" />
                Stripe Connect Health
              </CardTitle>
              <CardDescription>
                Monitor payout account status for all staff members
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAll}
              disabled={refreshingStaffId === 'all'}
            >
              {refreshingStaffId === 'all' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="p-3 rounded-lg border bg-card text-center">
              <p className="text-2xl font-bold text-green-400">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div className="p-3 rounded-lg border bg-card text-center">
              <p className="text-2xl font-bold text-yellow-400">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="p-3 rounded-lg border bg-card text-center">
              <p className="text-2xl font-bold text-blue-400">{onboardingCount}</p>
              <p className="text-xs text-muted-foreground">Incomplete</p>
            </div>
            <div className="p-3 rounded-lg border bg-card text-center">
              <p className="text-2xl font-bold text-destructive">{blockingCount}</p>
              <p className="text-xs text-muted-foreground">Blocked</p>
            </div>
          </div>

          {/* Accounts table */}
          {payoutAccounts.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Bank</TableHead>
                    <TableHead className="hidden md:table-cell">Requirements</TableHead>
                    <TableHead className="hidden md:table-cell">Last Sync</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutAccounts.map((account: any) => {
                    const reqs = account.requirements_currently_due as string[] || [];
                    const pending = account.requirements_pending_verification as string[] || [];
                    const hasIssues = reqs.length > 0 || pending.length > 0;

                    return (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{account.staff?.name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{account.staff?.email || ''}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(account)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {account.bank_last4 ? `•••• ${account.bank_last4}` : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[200px]">
                          {hasIssues ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5">
                                    {reqs.length > 0 && (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                        {reqs.length} due
                                      </Badge>
                                    )}
                                    {pending.length > 0 && (
                                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5 py-0">
                                        <Clock className="w-2.5 h-2.5 mr-0.5" />
                                        {pending.length} verifying
                                      </Badge>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {reqs.length > 0 && (
                                    <div className="mb-1">
                                      <p className="font-medium text-xs">Action Required:</p>
                                      <ul className="text-xs list-disc pl-3">
                                        {reqs.map((r: string, i: number) => (
                                          <li key={i}>{r.replace(/_/g, ' ')}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {pending.length > 0 && (
                                    <div>
                                      <p className="font-medium text-xs">Pending Verification:</p>
                                      <ul className="text-xs list-disc pl-3">
                                        {pending.map((r: string, i: number) => (
                                          <li key={i}>{r.replace(/_/g, ' ')}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {account.last_webhook_at
                            ? formatDistanceToNow(new Date(account.last_webhook_at), { addSuffix: true })
                            : account.updated_at
                              ? formatDistanceToNow(new Date(account.updated_at), { addSuffix: true })
                              : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleRefreshOne(account.staff_id)}
                                    disabled={refreshingStaffId === account.staff_id}
                                  >
                                    {refreshingStaffId === account.staff_id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Refresh from Stripe</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {(account.account_status === 'onboarding' || reqs.length > 0) && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => handleResendOnboardingLink(account.staff_id)}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Copy onboarding link</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No staff have started payout setup yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Staff without accounts */}
      {staffWithoutAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Staff Without Payout Accounts ({staffWithoutAccounts.length})
            </CardTitle>
            <CardDescription>
              These active staff members haven't started their payout setup
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staffWithoutAccounts.map((staff: any) => (
                <div key={staff.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                  <div>
                    <p className="text-sm font-medium">{staff.name}</p>
                    <p className="text-xs text-muted-foreground">{staff.email || 'No email'}</p>
                  </div>
                  <Badge variant="outline" className="text-muted-foreground">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Not Started
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Automated Requirements Widget */}
      <StripeRequirementsWidget />
    </div>
  );
}
