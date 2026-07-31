import { useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SEOHead } from '@/components/SEOHead';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { fmt } from '@/lib/activeCurrency';
import {
  useBillingRevenue,
  useBackfillFreshness,
  sumRows,
  SAAS_STREAMS,
  CLEANING_STREAMS,
  HEADLINE_CONFIDENCE,
  type RevenueRow,
  type Confidence,
  type Freshness,
} from '@/hooks/useBillingRevenue';

/**
 * Platform revenue — my view of the whole business, not an org-facing screen.
 *
 * Reads `billing_revenue_by_confidence` exclusively. See useBillingRevenue.ts for
 * why nothing here touches billing_events.
 *
 * Two rules this page exists to hold:
 *
 *  1. SaaS and cleaning are two businesses sharing one Stripe account. They are
 *     never summed. There is deliberately no "total revenue" figure anywhere.
 *  2. Confidence tiers are shown apart. Headlines use certain + probable, and the
 *     inferred remainder is stated as unclassified — never folded in silently, and
 *     never hidden in a tooltip.
 */

/** The view reports CENTS; fmt() takes dollars. One conversion, one place. */
const money = (cents: number) => fmt(cents / 100);

const CONFIDENCE_ORDER: Confidence[] = ['certain', 'probable', 'inferred'];

const CONFIDENCE_NOTE: Record<Confidence, string> = {
  certain: 'Verifiable — a booking or tip payment-intent match, or dated before the platform existed (18 Dec 2025).',
  probable: 'Payer email resolves to a known cleaning customer or an org owner.',
  inferred: 'No signal — amount shape only. Excluded from headline figures.',
};

function StalenessBanner({ freshness }: { freshness: Freshness | undefined }) {
  if (!freshness) return null;

  // Fresh is the only quiet state. Both others sit ABOVE the figures, because a
  // revenue page that looks authoritative while being weeks out of date is
  // precisely what this is here to prevent.
  if (freshness.state === 'fresh') {
    const when = freshness.loadedAt.toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <Clock className="w-3.5 h-3.5" />
        Snapshot — data loaded {when}. New Stripe activity appears when the backfill re-runs.
        {freshness.failedResources.length > 0 && (
          <span className="text-amber-600">
            {' '}· {freshness.failedResources.join(', ')} failed on the last run
          </span>
        )}
      </p>
    );
  }

  const message =
    freshness.state === 'stale'
      ? `These figures are ${freshness.ageDays} days old. Stripe activity since then is not shown.`
      : `Could not determine when this data was last loaded — treat these figures as potentially out of date. (${freshness.reason})`;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-sm">
            {freshness.state === 'stale' ? 'This data is out of date' : 'Data age unknown'}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
          {freshness.state === 'stale' && freshness.failedResources.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Last run failed on: {freshness.failedResources.join(', ')}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Gross / reversals / net, always all three. Never one reconstructed from another. */
function MoneyColumns({ gross, reversals, net }: { gross: number; reversals: number; net: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">Gross</p>
        <p className="font-semibold tabular-nums">{money(gross)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Reversals</p>
        <p className={`font-semibold tabular-nums ${reversals < 0 ? 'text-destructive' : ''}`}>
          {money(reversals)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Net</p>
        <p className="font-semibold tabular-nums">{money(net)}</p>
      </div>
    </div>
  );
}

function BusinessPanel({
  title, subtitle, rows,
}: { title: string; subtitle: string; rows: RevenueRow[] }) {
  const headline = sumRows(rows.filter((r) => HEADLINE_CONFIDENCE.includes(r.confidence)));
  const inferred = sumRows(rows.filter((r) => r.confidence === 'inferred'));
  const byConfidence = CONFIDENCE_ORDER
    .map((c) => ({ confidence: c, totals: sumRows(rows.filter((r) => r.confidence === c)) }))
    .filter((x) => x.totals.events > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold tabular-nums">{money(headline.net_cash_cents)}</p>
          <p className="text-xs text-muted-foreground">
            net · certain + probable · {headline.events} cash events
          </p>
          {/* Stated, not folded. The correction_confidence comment requires this. */}
          {inferred.events > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              + {money(inferred.net_cash_cents)} unclassified ({inferred.events} inferred events)
            </p>
          )}
          {(headline.nettingBroken || inferred.nettingBroken) && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Gross + reversals no longer equals net — do not trust these figures.
            </p>
          )}
        </div>

        <MoneyColumns
          gross={headline.gross_cents + inferred.gross_cents}
          reversals={headline.reversal_cents + inferred.reversal_cents}
          net={headline.net_cash_cents + inferred.net_cash_cents}
        />

        <div className="space-y-2 pt-1">
          {byConfidence.map(({ confidence, totals }) => (
            <div key={confidence} className="rounded-md border p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <Badge variant={confidence === 'inferred' ? 'outline' : 'secondary'}>
                  {confidence}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {totals.events} events
                </span>
              </div>
              <MoneyColumns
                gross={totals.gross_cents}
                reversals={totals.reversal_cents}
                net={totals.net_cash_cents}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">{CONFIDENCE_NOTE[confidence]}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyTable({ rows, streams, label }: { rows: RevenueRow[]; streams: string[]; label: string }) {
  const months = useMemo(() => {
    const scoped = rows.filter((r) => streams.includes(r.stream));
    const byMonth = new Map<string, RevenueRow[]>();
    for (const r of scoped) {
      const list = byMonth.get(r.month) ?? [];
      list.push(r);
      byMonth.set(r.month, list);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, monthRows]) => ({
        month,
        all: sumRows(monthRows),
        headline: sumRows(monthRows.filter((r) => HEADLINE_CONFIDENCE.includes(r.confidence))),
        inferred: sumRows(monthRows.filter((r) => r.confidence === 'inferred')),
      }));
  }, [rows, streams]);

  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground">No {label} activity recorded.</p>;
  }

  const peak = Math.max(...months.map((m) => Math.abs(m.all.net_cash_cents)), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2 font-medium">Month</th>
            <th className="text-right py-2 font-medium">Gross</th>
            <th className="text-right py-2 font-medium">Reversals</th>
            <th className="text-right py-2 font-medium">Net</th>
            <th className="text-right py-2 font-medium">Unclassified</th>
            <th className="text-right py-2 font-medium w-28">Shape</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {months.map((m) => (
            <tr key={m.month}>
              <td className="py-2 whitespace-nowrap">
                {new Date(`${m.month}T00:00:00`).toLocaleDateString(undefined, {
                  month: 'short', year: 'numeric',
                })}
              </td>
              <td className="py-2 text-right tabular-nums">{money(m.all.gross_cents)}</td>
              <td className={`py-2 text-right tabular-nums ${m.all.reversal_cents < 0 ? 'text-destructive' : ''}`}>
                {m.all.reversal_cents === 0 ? '—' : money(m.all.reversal_cents)}
              </td>
              <td className="py-2 text-right tabular-nums font-medium">{money(m.headline.net_cash_cents)}</td>
              <td className="py-2 text-right tabular-nums text-amber-600">
                {m.inferred.net_cash_cents === 0 ? '—' : money(m.inferred.net_cash_cents)}
              </td>
              <td className="py-2">
                {/* Deliberately a bar, not a sparkline: the question is "is this
                    growing, flat, or one good month", which a length answers
                    directly and at a glance. */}
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.max(2, (Math.abs(m.all.net_cash_cents) / peak) * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PlatformRevenuePage() {
  const { data: rows, isLoading, error } = useBillingRevenue();
  const { data: freshness } = useBackfillFreshness();

  const saas = useMemo(() => (rows ?? []).filter((r) => SAAS_STREAMS.includes(r.stream)), [rows]);
  const cleaning = useMemo(() => (rows ?? []).filter((r) => CLEANING_STREAMS.includes(r.stream)), [rows]);

  return (
    <AdminLayout title="Platform Revenue" subtitle="Owned copy of every dollar, from the billing ledger">
      <div className="portal-v2 portal-v2-scroll">
        <SEOHead title="Platform Revenue | TidyWise" description="Platform revenue" noIndex />

        <StalenessBanner freshness={freshness} />

        {error && (
          <Card className="mb-6 border-destructive/40">
            <CardContent className="p-4 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Could not load revenue</p>
                <p className="text-sm text-muted-foreground mt-0.5">{(error as Error).message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading revenue…
          </CardContent></Card>
        ) : !error && (
          <div className="space-y-6">
            {/* Two businesses, never summed. There is no combined total on this page. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <BusinessPanel
                title="SaaS"
                subtitle="Subscriptions, AI credits and ad management — businesses paying TidyWise"
                rows={saas}
              />
              <BusinessPanel
                title="Cleaning"
                subtitle="Merchant cleaning revenue — customers paying the cleaning business"
                rows={cleaning}
              />
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">SaaS by month</CardTitle></CardHeader>
              <CardContent><MonthlyTable rows={rows ?? []} streams={SAAS_STREAMS} label="SaaS" /></CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Cleaning by month</CardTitle></CardHeader>
              <CardContent><MonthlyTable rows={rows ?? []} streams={CLEANING_STREAMS} label="cleaning" /></CardContent>
            </Card>

            {/*
              The payer list is NOT built, and this is a placeholder rather than an
              empty table on purpose — an empty table reads as "nobody has paid".

              billing_revenue_by_confidence has grain (month, stream, confidence)
              and carries no customer, organisation or email column. The columns
              exist on billing_events, but that table is explicitly not a reporting
              surface and querying it directly is what produced both the $2,179 and
              the $49 errors. This needs a second view at payer grain — see
              docs/superpowers/plans/2026-07-31-platform-revenue-page.md.
            */}
            <Card className="border-dashed">
              <CardHeader className="pb-3"><CardTitle className="text-base">Who has paid</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Not available yet. <code className="text-xs">billing_revenue_by_confidence</code> is
                  grouped by month, stream and confidence — it carries no payer column, and the
                  ledger table underneath it is not a reporting surface. This needs a second view
                  at payer grain before it can be shown honestly.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
