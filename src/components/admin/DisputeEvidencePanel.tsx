import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Loader2, Shield, AlertTriangle, CheckCircle2, ExternalLink, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { QueryError } from '@/components/QueryError';
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

// Final Stripe dispute statuses — no evidence can be submitted once here.
const TERMINAL_STATUSES = new Set(['won', 'lost', 'warning_closed']);

const isClosed = (d: Dispute) => !!d.status && TERMINAL_STATUSES.has(d.status);
// Open and not yet responded to = still needs a response from us.
const needsResponse = (d: Dispute) => !isClosed(d) && !d.submitted_at;

// Drafted-evidence fields in display order, with plain-English labels.
const EVIDENCE_FIELDS: { key: string; label: string; long?: boolean }[] = [
  { key: 'product_description', label: 'Product / service', long: true },
  { key: 'customer_email_address', label: 'Customer email' },
  { key: 'customer_purchase_ip', label: 'Purchase IP address' },
  { key: 'customer_signature', label: 'Terms acceptance', long: true },
  { key: 'billing_address', label: 'Billing address' },
  { key: 'access_activity_log', label: 'Access & payment history' },
  { key: 'refund_policy', label: 'Refund policy', long: true },
  { key: 'refund_policy_disclosure', label: 'Refund policy disclosure', long: true },
  { key: 'cancellation_policy', label: 'Cancellation policy', long: true },
  { key: 'cancellation_policy_disclosure', label: 'Cancellation policy disclosure', long: true },
  { key: 'cancellation_rebuttal', label: 'Cancellation rebuttal', long: true },
  { key: 'refund_refusal_explanation', label: 'Refund refusal explanation', long: true },
  { key: 'uncategorized_text', label: 'Additional evidence / argument', long: true },
];

function EvidenceValue({ k, value, long }: { k: string; value: unknown; long?: boolean }) {
  // Access & payment history: JSON array string -> compact list, or an explicit
  // "none" box when the array is empty (never the literal "[]").
  if (k === 'access_activity_log' && typeof value === 'string') {
    try {
      const rows = JSON.parse(value) as Array<Record<string, unknown>>;
      if (Array.isArray(rows)) {
        if (rows.length === 0) {
          return (
            <div className="mt-1 rounded border border-border p-3 text-sm text-muted-foreground">
              No sessions recorded for this customer.
            </div>
          );
        }
        return (
          <div className="mt-1 rounded border divide-y max-h-48 overflow-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex justify-between gap-3 p-2 text-xs">
                <span>{r.date ? format(new Date(r.date as string), 'MMM d, yyyy') : '—'}</span>
                <span className="text-muted-foreground truncate">{(r.ip as string) || ''}</span>
                <span>
                  {r.amount_cents != null ? `$${((r.amount_cents as number) / 100).toFixed(2)}` : ''}
                </span>
              </div>
            ))}
          </div>
        );
      }
    } catch {
      /* fall through to raw text */
    }
  }

  // Billing address: JSON string -> single formatted line.
  if (k === 'billing_address' && typeof value === 'string') {
    try {
      const a = JSON.parse(value) as Record<string, string | null>;
      const line = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country]
        .filter(Boolean)
        .join(', ');
      if (line) return <p className="mt-0.5 text-sm">{line}</p>;
    } catch {
      /* fall through */
    }
  }

  // The CE 3.0 assessment is the fight-or-accept signal — give it weight.
  // Red accent when it says NOT QUALIFYING (lean toward accepting), green
  // when it qualifies (worth fighting).
  if (
    k === 'uncategorized_text' &&
    typeof value === 'string' &&
    /CE 3\.0|Compelling Evidence 3\.0/i.test(value)
  ) {
    const notQualifying = /NOT QUALIFYING/i.test(value);
    const cls = notQualifying
      ? 'border-l-4 border-destructive bg-destructive/10 text-destructive'
      : 'border-l-4 border-emerald-600 bg-emerald-600/10 text-foreground';
    return (
      <div className={`mt-1 rounded-r p-3 text-sm leading-relaxed whitespace-pre-wrap ${cls}`}>
        {value}
      </div>
    );
  }

  return (
    <p className={`mt-0.5 text-sm ${long ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>
      {String(value)}
    </p>
  );
}

function EvidenceView({ evidence }: { evidence: Record<string, unknown> }) {
  const [raw, setRaw] = useState(false);
  const has = (key: string) => {
    const v = evidence[key];
    return typeof v === 'string' ? v.trim().length > 0 : v != null;
  };
  const shown = EVIDENCE_FIELDS.filter((f) => has(f.key));

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Drafted evidence</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setRaw((r) => !r)}
        >
          {raw ? 'Show readable' : 'View raw'}
        </Button>
      </div>
      {raw ? (
        <pre className="mt-2 p-3 bg-muted rounded overflow-auto max-h-96 whitespace-pre-wrap text-xs">
          {JSON.stringify(evidence, null, 2)}
        </pre>
      ) : (
        <div className="mt-2 space-y-3">
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drafted evidence.</p>
          ) : (
            shown.map((f) => (
              <div key={f.key}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </p>
                <EvidenceValue k={f.key} value={evidence[f.key]} long={f.long} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Chargeback disputes with auto-drafted CE 3.0 evidence + submit-to-Stripe.
 * Lives in the platform-analytics Evidence tab. On open (and Refresh) it syncs
 * live status from Stripe so rows resolved in the Stripe Dashboard don't show
 * stale needs_response / an active Submit button. Submit flow is unchanged.
 */
export function DisputeEvidencePanel() {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { data: disputes, isLoading, refetch, error: disputesError } = useQuery<Dispute[]>({
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

  // Pull live status from Stripe (best-effort), then refetch the table.
  const syncAndRefetch = useCallback(async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke('sync-dispute-status');
    } catch {
      /* best-effort — still refetch whatever's in the table */
    }
    await refetch();
    setSyncing(false);
  }, [refetch]);

  useEffect(() => {
    syncAndRefetch();
  }, [syncAndRefetch]);

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

  // needs-response first, then other open (newest), closed sink to the bottom.
  const sorted = useMemo(() => {
    const rank = (d: Dispute) => (isClosed(d) ? 2 : needsResponse(d) ? 0 : 1);
    return [...(disputes ?? [])].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [disputes]);
  const onlyOne = sorted.length === 1;

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
          <Button variant="outline" size="sm" onClick={syncAndRefetch} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {disputesError ? (
          <QueryError subject="disputes" onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !disputes || disputes.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No disputes recorded.</div>
        ) : (
          <div className="space-y-3">
            {sorted.map((d) => {
              const closed = isClosed(d);
              const open = needsResponse(d) || onlyOne;
              return (
                <Card key={d.id}>
                  <Collapsible defaultOpen={open}>
                    <CollapsibleTrigger className="group w-full text-left">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-2">
                            <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                            <div>
                              <p className="text-base font-mono">{d.stripe_dispute_id}</p>
                              <div className="text-xs text-muted-foreground mt-1">
                                {d.customer_email || 'unknown email'} • opened {format(new Date(d.created_at), 'MMM d, yyyy')}
                              </div>
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
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="space-y-3 pt-0">
                        <div className="text-xs text-muted-foreground">
                          {d.matching_prior_count} prior undisputed transaction(s) with 2+ matching elements in the 120-365 day window.
                        </div>

                        {!d.qualifies_for_ce3 && (
                          <div className="text-xs bg-destructive/10 text-destructive rounded p-3 border border-destructive/20">
                            Likely unwinnable on CE 3.0 grounds. Consider accepting the dispute in the Stripe Dashboard instead of submitting evidence (submitting weak evidence still counts against your dispute-rate metrics).
                          </div>
                        )}

                        <div className="rounded border p-3 bg-muted/30">
                          <EvidenceView evidence={d.drafted_evidence} />
                        </div>

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
                          ) : closed ? (
                            <Badge variant="secondary">
                              Closed — {d.outcome || d.status}
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
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
