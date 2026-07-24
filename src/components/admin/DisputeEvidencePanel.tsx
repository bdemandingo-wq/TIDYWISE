import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Shield, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Dispute {
  id: string;
  stripe_dispute_id: string;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  customer_email: string | null;
  amount_cents: number | null;
  currency: string | null;
  reason: string | null;
  status: string | null;
  qualifies_for_ce3: boolean;
  matching_prior_count: number;
  drafted_evidence: Record<string, unknown>;
  submitted_at: string | null;
  outcome: string | null;
  created_at: string;
}

/**
 * Chargeback disputes with auto-drafted CE 3.0 evidence + submit-to-Stripe.
 * Extracted verbatim from the former /dashboard/disputes page so it can live
 * in the platform-analytics Evidence tab. Submit flow is unchanged.
 */
export function DisputeEvidencePanel() {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const { data: disputes, isLoading, refetch } = useQuery<Dispute[]>({
    queryKey: ['platform', 'disputes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disputes' as never)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Dispute[]) || [];
    },
  });

  const handleSubmit = async (d: Dispute) => {
    setSubmitting(d.id);
    try {
      const { data, error } = await supabase.functions.invoke('submit-dispute-evidence', {
        body: { dispute_id: d.id, submit: true },
      });
      if (error) throw error;
      toast.success(`Submitted to Stripe (status: ${(data as any)?.status || 'unknown'})`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5" /> Chargeback Disputes
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Stripe chargebacks with auto-drafted Visa Compelling Evidence 3.0 responses.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !disputes || disputes.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No disputes recorded.</div>
        ) : (
          <div className="space-y-3">
            {disputes.map((d) => (
              <Card key={d.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base font-mono">
                        {d.stripe_dispute_id}
                      </CardTitle>
                      <div className="text-xs text-muted-foreground mt-1">
                        {d.customer_email || 'unknown email'} • opened {format(new Date(d.created_at), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant="outline">
                        ${((d.amount_cents || 0) / 100).toFixed(2)} {(d.currency || 'usd').toUpperCase()}
                      </Badge>
                      <Badge variant="secondary">{d.reason || 'unknown'}</Badge>
                      <Badge variant={d.status === 'won' ? 'default' : d.status === 'lost' ? 'destructive' : 'outline'}>
                        {d.status || 'pending'}
                      </Badge>
                      {d.qualifies_for_ce3 ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> CE3.0 qualifying
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Not CE3.0 qualifying
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {d.matching_prior_count} prior undisputed transaction(s) with 2+ matching elements in the 120-365 day window.
                  </div>

                  {!d.qualifies_for_ce3 && (
                    <div className="text-xs bg-destructive/10 text-destructive rounded p-3 border border-destructive/20">
                      Likely unwinnable on CE 3.0 grounds. Consider accepting the dispute in the Stripe Dashboard instead of submitting evidence (submitting weak evidence still counts against your dispute-rate metrics).
                    </div>
                  )}

                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      View drafted evidence
                    </summary>
                    <pre className="mt-2 p-3 bg-muted rounded overflow-auto max-h-96 whitespace-pre-wrap">
                      {JSON.stringify(d.drafted_evidence, null, 2)}
                    </pre>
                  </details>

                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`https://dashboard.stripe.com/disputes/${d.stripe_dispute_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Stripe <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>

                    {d.submitted_at ? (
                      <Badge variant="secondary">
                        Submitted {format(new Date(d.submitted_at), 'MMM d, yyyy')}
                      </Badge>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" disabled={submitting === d.id}>
                            {submitting === d.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}
                            Submit to Stripe
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Submit drafted evidence to Stripe?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This finalizes the dispute response to the issuing bank. You won't be able to edit it afterward. Make sure the draft above reads correctly.
                              {!d.qualifies_for_ce3 && (
                                <span className="block mt-2 text-destructive font-medium">
                                  Warning: this dispute does NOT qualify for CE 3.0 — submission is unlikely to win.
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleSubmit(d)}>
                              Submit
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
