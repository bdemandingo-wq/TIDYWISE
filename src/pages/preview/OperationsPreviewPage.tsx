import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  Card,
  CardTitle,
  SettingsRow,
  Button,
  StatCard,
  DetailHeader,
  SegmentedTabs,
} from '@/components/portal-v2';

/**
 * Screens 9a / 9b — Operations Tracker, and its performance analytics.
 *
 * Preview route only, static data. Additive. 9b opens from 9a.
 *
 * ── This screen is hand-entered, and that changes everything ──────────
 *
 * 9a's primary action is "+ Entry", and 9b ends with an "Add daily entry"
 * form taking incoming calls, closed deals, revenue booked and leads
 * followed up. These numbers are not derived from bookings — someone types
 * them at the end of the day.
 *
 * That makes a zero genuinely ambiguous here in a way it is not elsewhere:
 * "0 cold outreach" can mean nobody made calls, or that nobody filled the
 * form in. The screen distinguishes them — a day with no entry says "no
 * entry yet" rather than showing zeroes, because a missing entry is a
 * missing record and not a quiet day.
 *
 * The two "best" cards use the default tone rather than gold: StatCard's
 * gold variant lands with the bookings branch and this one sits flat on
 * main. They should be gold once that merges — the comp trophies them.
 *
 * ── 9b has no chart ──────────────────────────────────────────────────
 *
 * Worth stating because "performance analytics" sounds like one. The comp
 * is four trophy stat cards and a plain monthly table — MONTH · CALLS ·
 * DEALS · REVENUE · CLOSE %. Across all 76 comps only two contain a chart
 * primitive, and neither is this one.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Close rate is a ratio, so it is suppressed rather than shown as 0% when
 * either side is unreadable. "0% close rate" is a judgement on somebody's
 * week, and the wrong one to make from a failed read.
 */

type View = 'tracker' | 'analytics';
type Period = 'weekly' | 'monthly';

const MONTHS = [
  { month: 'Aug 2026', calls: 34, deals: 17, revenue: '$4,174', close: '50.0%', best: false },
  { month: 'Jul 2026', calls: 16, deals: 14, revenue: '$4,362', close: '87.5%', best: false },
  { month: 'Jun 2026', calls: 61, deals: 30, revenue: '$10,352', close: '49.2%', best: true },
  { month: 'May 2026', calls: 42, deals: 13, revenue: '$3,339', close: '31.0%', best: false },
  { month: 'Apr 2026', calls: 29, deals: 11, revenue: '$3,140', close: '37.9%', best: false },
];

export default function OperationsPreviewPage() {
  const [view, setView] = useState<View>('tracker');
  const [period, setPeriod] = useState<Period>('monthly');
  const [hasEntry, setHasEntry] = useState(true);
  const [errored, setErrored] = useState(false);
  const m = (v: string) => (errored ? '—' : v);

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {(['tracker', 'analytics'] as View[]).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold ' +
              (view === v
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {v === 'tracker' ? '9a tracker' : '9b analytics'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setHasEntry(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold ' +
            (hasEntry
              ? 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]'
              : 'bg-[hsl(var(--pv-warn))] text-[hsl(var(--pv-brand-ink))]')
          }
        >
          {hasEntry ? "Today's entry filed" : 'No entry today'}
        </button>
        <button
          type="button"
          onClick={() => setErrored(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold ' +
            (errored
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-brand-ink))]'
              : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
          }
        >
          {errored ? 'Error' : 'Ready'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {!hasEntry
            ? 'These numbers are TYPED IN. A day with no entry says so rather than showing zeroes — a missing record is not a quiet day.'
            : '9b has no chart: four trophy cards and a plain table. Only 2 of 76 comps contain a chart at all.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        {view === 'tracker' ? (
          <>
            <InverseHeader
              eyebrow="Operations"
              business="Operations Tracker"
              revenueLabel="Weekly revenue"
              revenue={m('$458.00')}
              trend={errored || !hasEntry ? undefined : { direction: 'up', label: '66.7% close rate' }}
              error={errored}
              wells={
                <>
                  <StatWell value={hasEntry ? m('3') : '—'} caption="weekly calls" />
                  <StatWell value={hasEntry ? m('2') : '—'} caption="weekly closes" />
                  <StatWell value={hasEntry ? m('0') : '—'} caption="follow-ups" />
                </>
              }
            />

            <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
              {!hasEntry && (
                <Card>
                  <CardTitle>No entry for today yet</CardTitle>
                  {/* The distinction that matters on a hand-entered screen. */}
                  <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                    Nothing has been recorded for today. That is different from a
                    day with no calls — showing zeroes would make an unfiled day
                    look like a quiet one.
                  </p>
                  <div className="mt-2.5">
                    <Button variant="primary" className="rounded-[10px]">Add today&rsquo;s entry</Button>
                  </div>
                </Card>
              )}

              <Card>
                <div className="flex items-center gap-2">
                  <CardTitle>Monthly summary (August)</CardTitle>
                  <button
                    type="button"
                    className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
                    onClick={() => setView('analytics')}
                  >
                    Analytics →
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {[
                    { v: m('34'), c: 'total calls' },
                    { v: m('17'), c: 'total closes' },
                    /* A ratio — suppressed rather than zeroed. */
                    { v: errored ? '—' : '50.0%', c: 'close rate' },
                    { v: m('$4,174'), c: 'total revenue' },
                  ].map(x => (
                    <div key={x.c} className="rounded-[12px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3">
                      <p className="text-[18px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">{x.v}</p>
                      <p className="text-[10.5px] font-semibold text-[hsl(var(--pv-ink-3))]">{x.c}</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardTitle>Add daily entry</CardTitle>
                <div className="mt-1">
                  <SettingsRow kind="value" label="Incoming calls" value="0" onClick={() => undefined} />
                  <SettingsRow kind="value" label="Closed deals" value="0" onClick={() => undefined} />
                  <SettingsRow kind="value" label="Revenue booked" value="$0" onClick={() => undefined} />
                  <SettingsRow kind="value" label="Leads followed up" value="0" onClick={() => undefined} />
                </div>
                <div className="mt-2.5">
                  <Button variant="primary" className="rounded-[10px]">Add entry</Button>
                </div>
              </Card>
            </div>
          </>
        ) : (
          <>
            <DetailHeader title="Performance Analytics" onBack={() => setView('tracker')} />
            <div className="flex flex-col gap-3.5 px-5 pb-10 pt-1">
              <SegmentedTabs<Period>
                tabs={[
                  { id: 'weekly', label: 'Weekly view' },
                  { id: 'monthly', label: 'Monthly view' },
                ]}
                value={period}
                onChange={setPeriod}
                label="Analytics period"
              />

              <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Best week (rev)" value={m('$6,520')} caption="Jun 22 – Jun 28" />
                <StatCard label="Best month (rev)" value={m('$10,352')} caption="June 2026" />
                <StatCard label="Most calls (wk)" value={m('41')} caption="Jun 22 – Jun 28" />
                <StatCard label="Most deals (wk)" value={m('17')} caption="Jun 22 – Jun 28" />
              </div>

              {/* No chart. Four columns, all narrow — the shape 8b proved
                  survives 390px. */}
              <Card>
                <CardTitle>{period === 'monthly' ? 'By month' : 'By week'}</CardTitle>
                <div className="mt-2.5 grid grid-cols-[1fr_32px_32px_74px] gap-1.5 border-b border-[hsl(var(--pv-border))] pb-2 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[hsl(var(--pv-ink-3))]">
                  <span>Month</span>
                  <span className="text-right">Calls</span>
                  <span className="text-right">Deals</span>
                  <span className="text-right">Revenue</span>
                </div>
                {MONTHS.map(r => (
                  <div
                    key={r.month}
                    className="grid grid-cols-[1fr_32px_32px_74px] gap-1.5 border-b border-[hsl(var(--pv-border))] py-[11px] text-[12px]"
                  >
                    <span className="pr-2 font-bold text-[hsl(var(--pv-ink))]">
                      {r.month}
                      {r.best && !errored ? ' 🏆' : ''}
                    </span>
                    <span className="text-right text-[hsl(var(--pv-ink-3))]">{m(String(r.calls))}</span>
                    <span className="text-right text-[hsl(var(--pv-ink-3))]">{m(String(r.deals))}</span>
                    <span className="text-right font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                      {m(r.revenue)}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
