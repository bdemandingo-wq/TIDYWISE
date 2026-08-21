import { useState } from 'react';
import {
  Card,
  CardTitle,
  DetailHeader,
  SegmentedTabs,
  Sparkline,
  StatCard,
} from '@/components/portal-v2';

/**
 * Reports and Benchmarks at 390px.
 *
 * Preview route only, static. Additive. No comp exists for either — built to
 * the pattern the mockup set establishes, using the Sparkline primitive that
 * landed with 5r.
 *
 * ── Reports: nine desktop tabs, and only one of them survives intact ──────
 *
 * ReportsPage.tsx:449-457 has nine: Overview, P&L Overview, Customer LTV,
 * Staff Productivity, Revenue Forecast, Profit Margin, Cleaner Performance,
 * Availability, Service Duration. That is the same seventeen-tab problem
 * Settings had, one size smaller, and the same answer applies — a list you
 * can read beats a strip you have to drag.
 *
 * Overview is five metrics (ReportsOverview.tsx:253-285): gross volume, net
 * volume from sales, new customers, successful payments, spend per customer.
 * Each is a headline number plus a trend, which is exactly one Sparkline, so
 * Overview renders in full here. The other eight open as their own screens.
 *
 * ── Test mode is not a loading state and must not look like one ───────────
 *
 * ReportsOverview.tsx:255 renders 'X.XK' instead of the real figure when
 * useTestMode() is on. That is deliberate — it is for screenshots and demos —
 * but it means the screen has a fourth state beyond ready/loading/error, and
 * the placeholder is easy to mistake for a value that failed to arrive. It is
 * labelled here rather than left ambiguous.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────────
 *
 * Every metric on this screen is money or a count derived from money. None
 * renders 0 on failure, and the charts take null rather than a flat line,
 * because a revenue line along the bottom reads as a collapse rather than an
 * absent read.
 */

type Phase = 'ready' | 'loading' | 'error' | 'test';
type Period = '1W' | '4W' | '1Y' | 'MTD' | 'QTD' | 'YTD' | 'ALL';

const PERIODS: Period[] = ['1W', '4W', '1Y', 'MTD', 'QTD', 'YTD', 'ALL'];

/* Five metrics, matching ReportsOverview.tsx:253-285 exactly. */
const METRICS = [
  { title: 'Gross volume', value: '$85.16K', test: 'X.XK', series: [18, 34, 29, 62, 38, 41, 57, 49, 71, 64, 83, 78] },
  { title: 'Net volume from sales', value: '$79.02K', test: 'X.XK', series: [16, 31, 27, 57, 35, 38, 53, 45, 66, 60, 77, 72] },
  { title: 'New customers', value: '148', test: 'XX', series: [4, 9, 7, 14, 8, 11, 13, 10, 17, 15, 21, 19] },
  { title: 'Successful payments', value: '312', test: 'XX', series: [11, 19, 17, 31, 22, 25, 29, 24, 36, 33, 42, 39] },
  { title: 'Spend per customer', value: '$575', test: 'XXX', series: [40, 44, 43, 51, 46, 48, 52, 49, 56, 54, 60, 58] },
];

/* The eight tabs that are not Overview. Each is its own screen rather than a
   tab in a strip that has to be dragged. */
const OTHER_REPORTS = [
  { id: 'pnl', label: 'P&L Overview', description: 'Revenue against costs, by month' },
  { id: 'clv', label: 'Customer LTV', description: 'What a customer is worth over their life' },
  { id: 'staff-productivity', label: 'Staff Productivity', description: 'Jobs and hours per cleaner' },
  { id: 'forecasting', label: 'Revenue Forecast', description: 'Projected from booked work' },
  { id: 'profit-margin', label: 'Profit Margin', description: 'Margin per service and per job' },
  { id: 'cleaner-performance', label: 'Cleaner Performance', description: 'Ratings, punctuality, rework' },
  { id: 'cleaner-availability', label: 'Availability', description: 'Who can take more work' },
  { id: 'service-duration', label: 'Service Duration', description: 'Quoted against actual time' },
];

export default function ReportsPreviewPage() {
  const [view, setView] = useState<'reports' | 'benchmarks'>('reports');
  const [phase, setPhase] = useState<Phase>('ready');
  const [period, setPeriod] = useState<Period>('ALL');

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {(['reports', 'benchmarks'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold capitalize ' +
              (view === v
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {v}
          </button>
        ))}
        {(['ready', 'loading', 'error', 'test'] as Phase[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold capitalize ' +
              (phase === p
                ? 'bg-[hsl(var(--pv-ink))] text-[hsl(var(--pv-bg))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p === 'test' ? 'test mode' : p}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {phase === 'test'
            ? 'Test mode renders "X.XK" instead of the figure. It is a fourth state, and it must not be mistaken for a value that failed to load.'
            : view === 'benchmarks'
              ? 'A cohort too small to be anonymous shows nothing rather than a number — the peer set is other businesses.'
              : 'Nine desktop tabs. Overview renders in full; the other eight open as their own screens instead of a strip you drag.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <DetailHeader title={view === 'reports' ? 'Reports' : 'Benchmarks'} />
        <div className="px-5 pt-1">
          <SegmentedTabs<'reports' | 'benchmarks'>
            tabs={[
              { id: 'reports', label: 'Reports' },
              { id: 'benchmarks', label: 'Benchmarks' },
            ]}
            value={view}
            onChange={setView}
            label="Reporting area"
          />
        </div>

        {view === 'reports' ? (
          <ReportsBody phase={phase} period={period} setPeriod={setPeriod} />
        ) : (
          <BenchmarksBody phase={phase} />
        )}
      </main>
    </div>
  );
}

function ReportsBody({
  phase,
  period,
  setPeriod,
}: {
  phase: Phase;
  period: Period;
  setPeriod: (p: Period) => void;
}) {
  const ready = phase === 'ready';
  const test = phase === 'test';

  return (
    <div className="flex flex-col gap-3.5 px-5 pb-10 pt-3.5">
      {/* Wraps rather than scrolling, same as 1a. The live strip is
          overflow-x-auto with no-scrollbar. */}
      <div className="flex flex-wrap gap-1">
        {PERIODS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={
              'rounded-full text-[11px] ' +
              (period === p
                ? 'bg-[hsl(var(--pv-brand))] px-2.5 py-[5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'px-2 py-[5px] font-semibold text-[hsl(var(--pv-ink-3))]')
            }
          >
            {p}
          </button>
        ))}
      </div>

      {test && (
        <div className="rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5">
          <p className="text-[12px] font-bold text-[hsl(var(--pv-warn))]">
            Test mode — figures are hidden
          </p>
          <p className="mt-0.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
            The X&rsquo;s are placeholders for screenshots, not numbers that
            failed to load. Turn test mode off to see real figures.
          </p>
        </div>
      )}

      {phase === 'error' ? (
        <Card>
          <CardTitle>Reports didn&rsquo;t load</CardTitle>
          <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
            Every figure here is money or counted from it, so none of them are
            shown rather than shown wrong. Your bookings and payments are
            unaffected.
          </p>
        </Card>
      ) : (
        METRICS.map(m => (
          <Card key={m.title}>
            <CardTitle>{m.title}</CardTitle>
            <p className="mt-1 text-[26px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
              {test ? m.test : ready ? m.value : '—'}
            </p>
            <p className="mb-2 text-[11px] font-medium text-[hsl(var(--pv-ink-3))]">
              Dec 2025 – Aug 2026
            </p>
            {/* Test mode has real data underneath, so the shape still draws —
                it is the figure that is withheld, not the trend. */}
            <Sparkline
              points={ready || test ? m.series : null}
              height={56}
              label={`${m.title} over the period`}
              caption={phase === 'loading' ? 'Loading…' : 'Trend unavailable'}
            />
          </Card>
        ))
      )}

      <Card>
        <CardTitle>More reports</CardTitle>
        <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[hsl(var(--pv-ink-3))]">
          Eight more, each on its own screen.
        </p>
        <div className="mt-2.5 flex flex-col">
          {OTHER_REPORTS.map(r => (
            <button
              key={r.id}
              type="button"
              className="flex items-center gap-3 border-b border-[hsl(var(--pv-border))] py-3 text-left last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold text-[hsl(var(--pv-ink))]">
                  {r.label}
                </span>
                <span className="block truncate text-[11.5px] text-[hsl(var(--pv-ink-3))]">
                  {r.description}
                </span>
              </span>
              <span className="shrink-0 text-[hsl(var(--pv-ink-4))]">›</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Benchmarks — you against anonymous peers.
 *
 * BenchmarksPage.tsx:200-207 defines eight headline metrics, three of which
 * are lowerIsBetter (cancellation, no-show) — so "above peer" is not
 * automatically good and the comparison has to carry direction, not just a
 * delta. Getting that backwards would congratulate someone on a rising
 * cancellation rate.
 *
 * The cohort gate is the important part. :186 renders "Not enough peers in
 * this cohort yet" when the peer set is empty, and :171 falls back to "Cohort
 * too small". That is a privacy boundary, not an empty state: with two peers
 * in a cohort, a "peer average" is close to naming a competitor's numbers. So
 * a thin cohort shows nothing at all — not a number with a caveat.
 */
function BenchmarksBody({ phase }: { phase: Phase }) {
  const [cohort, setCohort] = useState<'local' | 'national'>('local');
  const [thin, setThin] = useState(false);
  const ready = phase === 'ready';

  const METRICS_B = [
    { label: 'Avg ticket', you: '$248', peer: '$212', better: true, lowerIsBetter: false },
    { label: 'Cancellation rate', you: '6.1%', peer: '4.4%', better: false, lowerIsBetter: true },
    { label: 'No-show rate', you: '1.2%', peer: '2.8%', better: true, lowerIsBetter: true },
    { label: 'Repeat customer rate', you: '61%', peer: '54%', better: true, lowerIsBetter: false },
    { label: 'Recurring share', you: '38%', peer: '41%', better: false, lowerIsBetter: false },
    { label: 'Review response rate', you: '18%', peer: '12%', better: true, lowerIsBetter: false },
    { label: 'Avg rating', you: '4.9', peer: '4.6', better: true, lowerIsBetter: false },
  ];

  return (
    <div className="flex flex-col gap-3.5 px-5 pb-10 pt-3.5">
      <div className="flex flex-wrap gap-1.5">
        {(['local', 'national'] as const).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setCohort(c)}
            aria-pressed={cohort === c}
            className={
              'rounded-full px-3 py-1.5 text-[11px] capitalize ' +
              (cohort === c
                ? 'bg-[hsl(var(--pv-brand))] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'font-semibold text-[hsl(var(--pv-ink-3))]')
            }
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setThin(v => !v)}
          className="ml-auto rounded-full bg-[hsl(var(--pv-sunken))] px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--pv-ink-2))]"
        >
          {thin ? 'Cohort: thin' : 'Cohort: 41 peers'}
        </button>
      </div>

      {phase === 'error' ? (
        <Card>
          <CardTitle>Benchmarks didn&rsquo;t load</CardTitle>
          <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
            Nothing is shown rather than shown wrong. Comparing yourself to a
            number that failed to arrive is worse than not comparing.
          </p>
        </Card>
      ) : thin ? (
        /* A privacy boundary, not an empty state. */
        <Card>
          <CardTitle>Not enough peers in this cohort yet</CardTitle>
          <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
            A peer average needs enough businesses that no single one can be
            worked out from it. This cohort is too small, so no figures are
            shown — try the national cohort.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="Cohort"
              value={ready ? '41' : '—'}
              caption={cohort === 'local' ? 'nearby businesses' : 'businesses nationally'}
            />
            <StatCard
              label="Ahead on"
              value={ready ? '5 of 7' : '—'}
              caption="measures"
            />
          </div>

          <Card>
            <CardTitle>All services, last 90 days</CardTitle>
            <div className="mt-2.5">
              {METRICS_B.map(m => (
                <div
                  key={m.label}
                  className="flex items-center gap-2.5 border-b border-[hsl(var(--pv-border))] py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                    {m.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                    {ready ? m.you : '—'}
                  </span>
                  {/* Direction, not just a delta — a rising cancellation rate
                      must never read as winning. */}
                  <span
                    className={
                      'w-[74px] shrink-0 text-right text-[11px] font-bold ' +
                      (ready
                        ? m.better
                          ? 'text-[hsl(var(--pv-success))]'
                          : 'text-[hsl(var(--pv-warn))]'
                        : 'text-[hsl(var(--pv-ink-3))]')
                    }
                  >
                    {ready ? `${m.better ? 'better' : 'worse'} · ${m.peer}` : '—'}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
              &ldquo;Better&rdquo; accounts for direction: lower is better for
              cancellations and no-shows.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
