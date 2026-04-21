import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, Mail, MailCheck, CheckCircle2, Loader2, Send, Clock, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

const REQUIREMENT_LABELS: Record<string, string> = {
  "individual.verification.document": "Photo ID",
  "individual.verification.additional_document": "Additional ID",
  "individual.ssn_last_4": "SSN last 4",
  "individual.id_number": "SSN / Gov ID",
  "individual.address.line1": "Street address",
  "external_account": "Bank account",
  "tos_acceptance.date": "Terms of Service",
  "tos_acceptance.ip": "Terms of Service",
};

function translateCode(code: string): string {
  return REQUIREMENT_LABELS[code] || code.replace(/[_.]/g, ' ');
}

export function StripeRequirementsWidget() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['stripe-requirement-notifications', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('stripe_requirement_notifications')
        .select('*, staff:staff(name, email)')
        .eq('organization_id', organization.id)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const manualFollowupCount = notifications.filter((n: any) => n.needs_manual_followup).length;

  const handleSendToAll = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-stripe-requirements', {
        body: { organizationId: organization?.id },
      });
      if (error) throw error;
      toast.success(`Processed: ${data?.emailsSent || 0} emails sent, ${data?.skipped || 0} skipped`);
      queryClient.invalidateQueries({ queryKey: ['stripe-requirement-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['stripe-connect-health'] });
    } catch (err: any) {
      toast.error('Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSending(false);
    }
  };

  const handleResendOne = async (notifId: string) => {
    setResendingId(notifId);
    try {
      // Trigger re-check which will send email if eligible
      const { error } = await supabase.functions.invoke('check-stripe-requirements', {
        body: { organizationId: organization?.id },
      });
      if (error) throw error;
      toast.success('Re-check triggered');
      queryClient.invalidateQueries({ queryKey: ['stripe-requirement-notifications'] });
    } catch (err: any) {
      toast.error('Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setResendingId(null);
    }
  };

  const handleMarkResolved = async (notifId: string) => {
    try {
      const { error } = await supabase
        .from('stripe_requirement_notifications')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', notifId);
      if (error) throw error;
      toast.success('Marked as resolved');
      queryClient.invalidateQueries({ queryKey: ['stripe-requirement-notifications'] });
    } catch (err: any) {
      toast.error('Failed: ' + (err.message || 'Unknown error'));
    }
  };

  const getTypeBadge = (type: string, needsFollowup: boolean) => {
    if (needsFollowup) {
      return <Badge variant="destructive" className="text-[10px]"><UserX className="w-2.5 h-2.5 mr-0.5" />Manual</Badge>;
    }
    switch (type) {
      case 'past_due':
        return <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Past Due</Badge>;
      case 'currently_due':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Due</Badge>;
      case 'pending_verification':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]"><Clock className="w-2.5 h-2.5 mr-0.5" />Verifying</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Outstanding Requirements
              {notifications.length > 0 && (
                <Badge variant="destructive" className="ml-1">{notifications.length}</Badge>
              )}
              {manualFollowupCount > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 ml-1">
                        {manualFollowupCount} need follow-up
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>These cleaners have been emailed 3+ times with no resolution</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardTitle>
            <CardDescription>Automated email tracking for cleaners with incomplete payout setup</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendToAll}
            disabled={sending}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Check &amp; Send to All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <MailCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No outstanding requirements — all cleaners are good!</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cleaner</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead className="hidden sm:table-cell">Days Outstanding</TableHead>
                  <TableHead className="hidden md:table-cell">Last Emailed</TableHead>
                  <TableHead className="hidden md:table-cell">Emails</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notif: any) => {
                  const codes = (notif.stripe_requirement_codes as string[]) || [];
                  const daysOutstanding = Math.floor((Date.now() - new Date(notif.created_at).getTime()) / (1000 * 60 * 60 * 24));

                  return (
                    <TableRow key={notif.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{notif.staff?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{notif.staff?.email || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {getTypeBadge(notif.requirement_type, notif.needs_manual_followup)}
                          <div className="text-xs text-muted-foreground max-w-[180px] truncate">
                            {codes.map(translateCode).join(', ')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className={`text-sm font-medium ${daysOutstanding > 7 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {daysOutstanding}d
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {notif.last_emailed_at
                          ? formatDistanceToNow(new Date(notif.last_emailed_at), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-[10px]">{notif.email_sent_count}×</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {!notif.needs_manual_followup && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleResendOne(notif.id)}
                                    disabled={resendingId === notif.id}
                                  >
                                    {resendingId === notif.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Send className="w-3.5 h-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Resend email</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleMarkResolved(notif.id)}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark resolved</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
