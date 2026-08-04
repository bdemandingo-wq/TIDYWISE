import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, ArrowRight, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface EmailChangeRequest {
  id: string;
  created_at: string;
  message: string | null;
  link: string | null;
  metadata: {
    customer_id?: string;
    current_email?: string;
    requested_email?: string;
    source?: string;
  } | null;
}

/**
 * Email-change requests raised from the client portal.
 *
 * These are not notifications in the informational sense — each one is a
 * customer waiting on a decision. `client-portal-api`'s request_email_change
 * action records the request but changes nothing; an admin has to actually
 * edit the customer, which they can do from EditCustomerDialog.
 *
 * Reads admin_system_notifications rather than a bespoke table: that row
 * already carries type, a dedupe_key and the old/new address in metadata, so
 * there is nothing to migrate. is_read is the handled flag, and org admins
 * already hold UPDATE on this table, so clearing one needs no backend work
 * either.
 */
export function EmailChangeRequestsPanel() {
  const { organizationId } = useOrgId();
  const qc = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['email-change-requests', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<EmailChangeRequest[]> => {
      const { data, error } = await supabase
        .from('admin_system_notifications')
        .select('id, created_at, message, link, metadata')
        .eq('organization_id', organizationId!)
        .eq('type', 'email_change_request')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      // No catch-to-empty: "no outstanding requests" and "the query failed"
      // must not render identically, or a customer waits indefinitely on a
      // decision nobody knows they need to make (CLAUDE.md rule 5).
      if (error) throw error;
      return (data ?? []) as EmailChangeRequest[];
    },
  });

  const markHandled = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('admin_system_notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-change-requests', organizationId] });
      toast.success('Marked as handled');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not mark it handled'),
  });

  // Nothing outstanding is the normal state — say so quietly rather than
  // rendering an empty box.
  if (!isLoading && requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email change requests
          {requests.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({requests.length})</span>
          )}
        </CardTitle>
        <CardDescription>
          Clients who asked to change their sign-in email. Changing it is manual — open the
          customer and update their email, then mark the request handled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          requests.map((r) => {
            const from = r.metadata?.current_email;
            const to = r.metadata?.requested_email;
            const customerId = r.metadata?.customer_id;
            return (
              <div key={r.id} className="rounded-lg border p-3 space-y-2">
                <p className="text-sm">{r.message}</p>

                {(from || to) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-muted-foreground">{from || '(none on file)'}</span>
                    <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{to}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {customerId && (
                    <Button asChild variant="outline" size="sm" className="min-h-[44px]">
                      <Link to={r.link || `/dashboard/customers?customer=${customerId}`}>
                        Open customer
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-2 min-h-[44px]"
                    disabled={markHandled.isPending}
                    onClick={() => markHandled.mutate(r.id)}
                  >
                    <Check className="w-4 h-4" />
                    Mark handled
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
