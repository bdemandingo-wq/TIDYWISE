import { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SEOHead } from '@/components/SEOHead';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Download, Loader2 } from 'lucide-react';
import { fmt } from '@/lib/activeCurrency';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { saveBlob } from '@/lib/fileActions';
import { buildPlatformRevenueCsv, type BillingEventRow } from '@/lib/platformRevenueExport';
import {
  useBillingRevenue,
  useBackfillFreshness,
  useBillingPlanPayers,
  sumRows,
  SAAS_STREAMS,
  HEADLINE_CONFIDENCE,
  type RevenueRow,
  type Totals,
  type Freshness,
  type PlanPayer,
} from '@/hooks/useBillingRevenue';

/**
 * CRM revenue — what businesses pay for TidyWise.
 *
 * Reads `billing_revenue_by_confidence` exclusively. See useBillingRevenue.ts for
 * why nothing here touches billing_events.
 *
 * Merchant cleaning revenue is deliberately absent. It shares a Stripe account
 * with this business but is not this business, and the two were never summed
 * even when both were on the page — so removing one changes no figure.
 *
 * Confidence tiers are no longer shown. They are data-quality machinery for the
 * backfill, not something an owner acts on. Headline figures still use certain +
 * probable exactly as before; the grading is applied, just not displayed.
 */

/** The view reports CENTS; fmt() takes dollars. One conversion, one place. */
const money = (cents: number) => fmt(cents / 100);

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** 'YYYY-MM-DD' or 'YYYY-MM' -> [year, month]. Never via Date, so no zone can shift it. */
function parseMonthKey(key: string): [number, number] {
  const [y, m] = key.split('-');
  return [Number(y), Number(m)];
}

interface MonthPoint extends Totals {
  key: string;
  y: number;
  m: number;
}

/**
 * A continuous month axis from the first recorded month to the current one.
 *
 * Gaps are filled with zeros rather than skipped. May 2026 has no billing rows
 * at all, and a table could quietly omit it — a chart cannot, because a missing
 * column would silently compress the timeline and make growth look steadier
 * than it was.
 *
 * A month with events worth $0 and a month with no events both render as $0.
 * Telling them apart is backfill machinery, which is exactly what this page
 * stopped displaying.
 */
function buildMonthlySeries(rows: RevenueRow[]): MonthPoint[] {
  const scoped = rows.filter(
    (r) => SAAS_STREAMS.includes(r.stream) && HEADLINE_CONFIDENCE.includes(r.confidence),
  );
  if (scoped.length === 0) return [];

  const byMonth = new Map<string, RevenueRow[]>();
  for (const r of scoped) {
    const [y, m] = parseMonthKey(r.month);
    const key = `${y}-${String(m).padStart(2, '0')}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), r]);
  }

  const [startY, startM] = parseMonthKey([...byMonth.keys()].sort()[0]);
  /* eslint-disable local/no-device-local-dates -- platform-wide page with no
     organisation context, so there is no org zone to resolve against. "This
     month" here means the viewer's month, and the viewer is the owner. */
  const now = new Date();
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  /* eslint-enable local/no-device-local-dates */

  const out: MonthPoint[] = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ key, y, m, ...sumRows(byMonth.get(key) ?? []) });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

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
          <span className="text-warning">
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
    <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
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

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold tabular-nums mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

const PLOT_H = 180;
/** So a genuinely small month is legible without being inflated into a big one. */
const MIN_BAR = 3;

/**
 * Monthly net, as bars around a real zero line.
 *
 * The baseline is drawn and the scale is SHARED between positive and negative.
 * April 2026 is −$50 against a $892 July, so it renders as a few pixels below
 * the line — which is the truth. Giving the negative region its own scale would
 * make one refund look like a trading month. It is found by colour and by its
 * label, not by being drawn bigger than it was.
 *
 * Gross and reversals appear only for months that have a reversal. Everywhere
 * else the two numbers are just net repeated with a zero beside it.
 */
function MonthlyBars({ series }: { series: MonthPoint[] }) {
  const nets = series.map((s) => s.net_cash_cents);
  const maxPos = Math.max(0, ...nets);
  const maxNeg = Math.min(0, ...nets);
  const range = maxPos + Math.abs(maxNeg);

  if (series.length === 0 || range === 0) {
    return <p className="text-sm text-muted-foreground">No revenue recorded yet.</p>;
  }

  const posBand = Math.round((PLOT_H * maxPos) / range);
  const negBand = PLOT_H - posBand;
  const barH = (v: number) => Math.max(MIN_BAR, Math.round((Math.abs(v) / range) * PLOT_H));
  const withReversals = series.filter((s) => s.reversal_cents !== 0);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="relative flex items-stretch gap-2" style={{ height: PLOT_H }}>
          {/* One continuous baseline across the plot, not a segment per column. */}
          <div
            className="absolute left-0 right-0 h-px bg-border"
            style={{ top: posBand }}
            aria-hidden="true"
          />
          {series.map((s) => (
            <div key={s.key} className="relative flex-1 flex flex-col">
              <div className="flex items-end" style={{ height: posBand }}>
                {s.net_cash_cents > 0 && (
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: barH(s.net_cash_cents) }}
                  />
                )}
              </div>
              <div className="flex items-start" style={{ height: negBand }}>
                {s.net_cash_cents < 0 && (
                  <div
                    className="w-full rounded-b bg-destructive"
                    style={{ height: barH(s.net_cash_cents) }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* The axis carries the numbers so the plot can stay pure shape — which
            also means a 11px negative band never has to hold a label. */}
        <div className="flex gap-2 mt-2">
          {series.map((s) => (
            <div key={s.key} className="flex-1 text-center">
              <p className="text-[11px] text-muted-foreground">{MONTH_ABBR[s.m - 1]}</p>
              <p
                className={`text-[11px] tabular-nums ${
                  s.net_cash_cents < 0
                    ? 'text-destructive font-medium'
                    : s.net_cash_cents === 0
                      ? 'text-muted-foreground'
                      : 'font-medium'
                }`}
              >
                {money(s.net_cash_cents)}
                {s.reversal_cents !== 0 && <span className="text-destructive">{' '}↩</span>}
              </p>
            </div>
          ))}
        </div>

        {withReversals.length > 0 && (
          <div className="mt-3 border-t pt-3 space-y-1">
            {withReversals.map((s) => (
              <p key={s.key} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {MONTH_FULL[s.m - 1]} {s.y}
                </span>
                {' · '}gross {money(s.gross_cents)}
                {' · '}
                <span className="text-destructive">reversals {money(s.reversal_cents)}</span>
                {' · '}net {money(s.net_cash_cents)}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Who is paying for TidyWise.
 *
 * Paying businesses only. Trials collapse into one muted row instead of sitting
 * among them: 8 of the 20 rows in the view have paid nothing, so a flat list
 * footed "20 businesses paying" was untrue by 8.
 *
 * The $10 gap between this list and total earned is `ai_credits`, which is SaaS
 * revenue that the ledger does not attribute to a business. It gets its own
 * footer line rather than a subtitle, so the three numbers add up on screen.
 *
 * The reconciliation warning is not decoration: if the payer rows stop summing
 * to the plan total from billing_revenue_by_confidence, rows are being dropped
 * and the list is lying by omission. It says so rather than just rendering
 * shorter.
 */
function PayerList({ planRows, aiCreditsNet }: { planRows: RevenueRow[]; aiCreditsNet: number }) {
  const { data: payers, isLoading, error } = useBillingPlanPayers();
  const [showTrials, setShowTrials] = useState(false);


  const all = payers ?? [];
  // Not `> 0`: a payer refunded below zero is still a payer, and hiding them in
  // the trial row would be the same omission this panel exists to prevent.
  const paying = all.filter((p) => p.net_cash_cents !== 0);
  const trials = all.filter((p) => p.net_cash_cents === 0);

  const payersTotal = all.reduce((a, p) => a + p.net_cash_cents, 0);
  const planTotal = sumRows(planRows);
  const reconciles = all.length === 0 || payersTotal === planTotal.net_cash_cents;

  const label = (p: PlanPayer) =>
    p.organization_name ?? p.customer_email ?? (p.organization_id ? 'Unnamed organisation' : 'Unattributed');

  const monthYear = (iso: string | null) =>
    // eslint-disable-next-line local/no-device-local-dates -- viewer-local display of a stored instant, not a business-day boundary
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';

  const period = (p: PlanPayer) => {
    const from = monthYear(p.first_payment_at);
    const to = monthYear(p.last_payment_at);
    return from === to ? from : `${from} – ${to}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Who's paying</CardTitle>
        <p className="text-xs text-muted-foreground">
          Plan revenue — subscription payments, per business.
        </p>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            Could not load payers — {(error as Error).message}
          </p>
        )}

        {isLoading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading payers…
          </p>
        )}

        {!isLoading && !error && all.length === 0 && (
          <p className="text-sm text-muted-foreground">No plan payments recorded in the ledger.</p>
        )}

        {!isLoading && !error && all.length > 0 && (
          <>
            {!reconciles && (
              <p className="text-xs text-destructive mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Payer rows total {money(payersTotal)} but plan revenue is{' '}
                {money(planTotal.net_cash_cents)} — rows are missing from this list.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[440px]">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 font-medium">Business</th>
                    <th className="text-left py-2 font-medium">Paying since</th>
                    <th className="text-right py-2 font-medium">Payments</th>
                    <th className="text-right py-2 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paying.map((p) => (
                    <tr key={p.organization_id ?? p.customer_email ?? 'unattributed'}>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{label(p)}</span>
                        {p.customer_email && p.organization_name && (
                          <span className="block text-[11px] text-muted-foreground">
                            {p.customer_email}
                          </span>
                        )}
                        {/* Reversals only where they exist — same rule as the chart. */}
                        {p.reversal_cents !== 0 && (
                          <span className="block text-[11px] text-destructive">
                            {money(p.reversal_cents)} refunded
                            {p.reversal_events > 0 && ` · ${p.reversal_events}×`}
                          </span>
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap text-muted-foreground">{period(p)}</td>
                      <td className="py-2 text-right tabular-nums">{p.payment_events}</td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {money(p.net_cash_cents)}
                      </td>
                    </tr>
                  ))}

                  {trials.length > 0 && (
                    <>
                      <tr className="text-muted-foreground">
                        <td className="py-2 pr-3" colSpan={3}>
                          <button
                            type="button"
                            onClick={() => setShowTrials((v) => !v)}
                            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                            aria-expanded={showTrials}
                          >
                            {showTrials
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                            {trials.length} {trials.length === 1 ? 'business' : 'businesses'} on
                            trial — nothing paid yet
                          </button>
                        </td>
                        <td className="py-2 text-right tabular-nums">{money(0)}</td>
                      </tr>

                      {showTrials && trials.map((p) => (
                        <tr
                          key={`trial-${p.organization_id ?? p.customer_email ?? 'unattributed'}`}
                          className="text-muted-foreground"
                        >
                          <td className="py-2 pr-3 pl-6">
                            <span className="font-medium text-foreground">{label(p)}</span>
                            {p.customer_email && p.organization_name && (
                              <span className="block text-[11px]">{p.customer_email}</span>
                            )}
                          </td>
                          <td className="py-2 whitespace-nowrap">On trial</td>
                          <td className="py-2 text-right tabular-nums">{p.payment_events}</td>
                          <td className="py-2 text-right tabular-nums">{money(0)}</td>
                        </tr>
                      ))}
                    </>
                  )}

                </tbody>
                <tfoot className="border-t">
                  <tr>
                    <td className="pt-2" colSpan={3}>
                      Plan revenue · {paying.length}{' '}
                      {paying.length === 1 ? 'business' : 'businesses'}
                    </td>
                    <td className="pt-2 text-right tabular-nums">{money(payersTotal)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-muted-foreground" colSpan={3}>
                      AI credits · not attributed per business
                    </td>
                    <td className="py-1 text-right tabular-nums text-muted-foreground">
                      {money(aiCreditsNet)}
                    </td>
                  </tr>
                  <tr className="border-t font-semibold">
                    <td className="pt-2" colSpan={3}>Total earned</td>
                    <td className="pt-2 text-right tabular-nums">
                      {money(payersTotal + aiCreditsNet)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * `embedded` renders the same figures without the page chrome, so the Platform
 * Analytics "Revenue" tab shows exactly this data rather than a second, drifting
 * copy of it.
 */
export function PlatformRevenueView({ embedded = false }: { embedded?: boolean }) {

  const { data: rows, isLoading, error } = useBillingRevenue();
  const { data: freshness } = useBackfillFreshness();
  const { data: payers } = useBillingPlanPayers();
  const [exporting, setExporting] = useState(false);

  /*
    Exit-readiness: one file someone can be handed without access to Lovable,
    Supabase or this repo.

    billing_events is fetched HERE rather than by a hook, because the page never
    needs it — it is several orders larger than the two views and would be dead
    weight on every page load for a button that is pressed rarely.
  */
  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: events, error: eventsError } = await supabase
        .from('billing_events')
        .select(
          'occurred_at, organization_name, customer_email, event_type, revenue_stream, ' +
          'revenue_stream_corrected, correction_confidence, correction_basis, counts_as_cash, ' +
          'is_proration, currency, amount_cents, fee_cents, net_cents, description, ' +
          'stripe_charge_id, stripe_invoice_id, stripe_subscription_id, stripe_customer_id',
        )
        // Ordered by a unique tiebreaker as well as the date — CLAUDE.md rule 3.
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true });

      // Not swallowed into an empty section: a file that silently omits the
      // evidence is worse than one that fails to download (CLAUDE.md rule 5).
      if (eventsError) throw eventsError;

      const csv = buildPlatformRevenueCsv({
        revenue: rows ?? [],
        payers: payers ?? [],
        // PostgREST types a string select() as GenericStringError[]; the shape
        // is asserted once here rather than per field inside the builder.
        events: (events ?? []) as unknown as BillingEventRow[],
        generatedAt: new Date(),
      });
      const stamp = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      await saveBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
        `tidywise-platform-revenue-${stamp}.csv`,
      );
    } catch (e) {
      console.error('[PlatformRevenue] export failed', e);
      toast.error(e instanceof Error ? e.message : 'Could not build the export.');
    } finally {
      setExporting(false);
    }
  };

  const series = useMemo(() => buildMonthlySeries(rows ?? []), [rows]);

  const earned = useMemo(
    () => sumRows((rows ?? []).filter(
      (r) => SAAS_STREAMS.includes(r.stream) && HEADLINE_CONFIDENCE.includes(r.confidence),
    )),
    [rows],
  );

  // The tripwire compares against every plan row regardless of confidence,
  // exactly as before — it is checking the payer view for dropped rows, not
  // restating a headline.
  const planRows = useMemo(() => (rows ?? []).filter((r) => r.stream === 'plan'), [rows]);

  const aiCreditsNet = useMemo(
    () => sumRows((rows ?? []).filter(
      (r) => SAAS_STREAMS.includes(r.stream)
        && r.stream !== 'plan'
        && HEADLINE_CONFIDENCE.includes(r.confidence),
    )).net_cash_cents,
    [rows],
  );

  const payingCount = (payers ?? []).filter((p) => p.net_cash_cents !== 0).length;
  const trialCount = (payers ?? []).filter((p) => p.net_cash_cents === 0).length;

  const first = series[0];
  const current = series[series.length - 1];

  const exportButton = (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-2">
      {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      {exporting ? 'Building…' : 'Export ledger'}
    </Button>
  );

  return (
    <AdminLayout
      title="CRM Revenue"
      subtitle="What businesses pay for TidyWise, from the billing ledger"
      actions={exportButton}
    >
      <div className="portal-v2 portal-v2-scroll">
        <SEOHead title="CRM Revenue | TidyWise" description="CRM revenue" noIndex />

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
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard
                label="Total earned"
                value={money(earned.net_cash_cents)}
                sub={first ? `since ${MONTH_ABBR[first.m - 1]} ${first.y}` : 'no revenue yet'}
              />
              <MetricCard
                label="Paying businesses"
                value={String(payingCount)}
                sub={trialCount > 0 ? `${trialCount} more on trial` : 'none on trial'}
              />
              <MetricCard
                label="This month"
                value={money(current?.net_cash_cents ?? 0)}
                sub={current ? `${MONTH_FULL[current.m - 1]} ${current.y}` : '—'}
              />
            </div>

            {/* Kept from the panels this replaced: the identity is checked, not
                assumed, so a future view change surfaces as a warning rather
                than as a plausible number. */}
            {earned.nettingBroken && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Gross + reversals no longer equals net — do not trust these figures.
              </p>
            )}

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Monthly</CardTitle></CardHeader>
              <CardContent><MonthlyBars series={series} /></CardContent>
            </Card>

            <PayerList planRows={planRows} aiCreditsNet={aiCreditsNet} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
