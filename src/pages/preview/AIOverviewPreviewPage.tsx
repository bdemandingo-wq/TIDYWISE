import { useState } from 'react';
import {
  Card,
  CardTitle,
  InverseHeader,
  StatWell,
  SegmentedTabs,
  AIInsightCard,
} from '@/components/portal-v2';

/**
 * Screen 7a — AI Intelligence, Overview.
 *
 * Preview route only, static data. Additive.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header   inverse; hero "Monthly revenue $10,655" with "−5% vs last
 *            month" beside it; three wells (hot leads, churn risk,
 *            conversion)
 *   tabs     Overview / Leads / Retention / Ask AI
 *   card     radius 16, padding 16/18
 *   chip     10px/800 in danger ink on a danger tint, padding 4/11
 *   confid.  11px/600 muted, beside the chip
 *   body     12.5px at line-height 1.6, 9px below
 *   rec      a TINTED PANEL — radius 10, padding 11/13, 11.5px at lh 1.55
 *
 * ── Analysis and recommendation are separated on purpose ──────────────
 *
 * The comp does not end the card with a link. It ends with a tinted panel
 * carrying the thing to actually do — "Launch a win-back campaign for 20
 * clients inactive 30–60 days. Offer 15% loyalty discount + free add-on."
 * The paragraph above it is analysis; the panel is an instruction. Giving
 * them different surfaces is what stops the recommendation reading as more
 * commentary, so AIInsightCard gains `recommendation` rather than reusing
 * `actionLabel`.
 *
 * ── The confidence label is not decoration ────────────────────────────
 *
 * "High confidence" sits beside the severity chip on every card. An AI
 * assertion about someone's revenue needs to say how sure it is, and
 * putting that at the top — before the claim — lets a reader discount it
 * before reading rather than after.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Insights are generated, so "we could not generate them" and "there is
 * nothing to report" are different and must look it. AIInsightCard already
 * had an `error` state saying "Your numbers are unaffected" — the point
 * being that a failed ANALYSIS says nothing about the underlying figures,
 * and a reader must not infer a bad month from a broken insight.
 */

type Tab = 'overview' | 'leads' | 'retention' | 'ask';
type Phase = 'ready' | 'error';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Two insights: one urgent, one opportunity. Each states its confidence before its claim.' },
  { id: 'error', label: 'Error', why: 'A failed ANALYSIS says nothing about the figures — the card says so explicitly.' },
];

export default function AIOverviewPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [tab, setTab] = useState<Tab>('overview');
  const errored = phase === 'error';
  const m = (v: string) => (errored ? '—' : v);

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {PHASES.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPhase(p.id)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (phase === p.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]'
                : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {PHASES.find(p => p.id === phase)?.why}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="AI Intelligence"
          business="Overview"
          revenueLabel="Monthly revenue"
          revenue={m('$10,655')}
          /* A negative trend, which is the honest reading of this month. */
          trend={errored ? undefined : { direction: 'down', label: '5% vs last month' }}
          error={errored}
          wells={
            <>
              <StatWell value={m('285')} caption="hot leads" />
              <StatWell value={m('10')} caption="churn risk" />
              <StatWell value={m('48%')} caption="conversion" />
            </>
          }
        />

        <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
          <SegmentedTabs<Tab>
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'leads', label: 'Leads' },
              { id: 'retention', label: 'Retention' },
              { id: 'ask', label: 'Ask AI' },
            ]}
            value={tab}
            onChange={setTab}
            label="AI intelligence section"
          />

          {tab === 'overview' && (<>
          <AIInsightCard
            kind="urgent"
            confidence="High confidence"
            body="Revenue declined 5% month-over-month ($10,655 vs $11,255). Top performer Stephanie Pickett generates $11,273 across 43 bookings, but 170 clients are inactive 90+ days — a reactivation goldmine."
            recommendation="Launch a win-back campaign for 20 clients inactive 30–60 days. Offer 15% loyalty discount + free add-on. Assign Stephanie Pickett as primary contact."
            actionLabel="Start campaign"
            error={errored}
          />

          <AIInsightCard
            kind="opportunity"
            confidence="High confidence"
            body="10 warm leads have not been contacted in over a week. Quoted value across them is $2,340, and conversion on this segment has been running at 48%."
            recommendation="Call the five oldest today. Lead with the loyalty discount already offered to Aaliyah and Denise Lester."
            actionLabel="Open pipeline"
            error={errored}
          />
          </>)}

          {/* 7b — Ask AI. Four canned questions above a free prompt, then the
              answer. The questions are not filler: they are the ones an owner
              actually asks, and they teach what this can be asked at all. */}
          {tab === 'ask' && (
            <>
              <Card>
                <CardTitle>Ask TidyWise AI</CardTitle>
                <div className="mt-2.5 flex flex-col gap-2">
                  {[
                    'Why did revenue drop this month?',
                    'Which 5 clients should I call today?',
                    'Most profitable day of the week?',
                    'Draft a win-back text for Thomas Murray',
                  ].map(q => (
                    <button
                      key={q}
                      type="button"
                      className="rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3.5 py-2.5 text-left text-[12px] font-semibold text-[hsl(var(--pv-ink))]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex h-11 items-center rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3">
                  <input
                    placeholder="Ask anything about your business…"
                    className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none"
                  />
                </label>
              </Card>

              <AIInsightCard
                kind="opportunity"
                confidence="Based on 6 months of bookings"
                body="Staff Friday heavily — your top performer Stephanie Pickett ($11,273 revenue) and Bruce Davis (48 bookings) should be prioritised for Friday afternoons."
                error={errored}
              />
            </>
          )}

          {/* 7c — Scheduling, churn and leads. The week grid is a demand
              shape, not a calendar: it answers "when do I need people". */}
          {(tab === 'leads' || tab === 'retention') && (
            <>
              <Card>
                <CardTitle>This week&rsquo;s bookings</CardTitle>
                <p className="mt-0.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                  Aug 17 – Aug 23
                </p>
                <div className="mt-3 grid grid-cols-7 gap-1.5">
                  {[
                    { d: 'M', n: 1 }, { d: 'T', n: 1 }, { d: 'W', n: 0 },
                    { d: 'T', n: 2 }, { d: 'F', n: 3 }, { d: 'S', n: 2 }, { d: 'S', n: 0 },
                  ].map((x, i) => (
                    <div key={i} className="rounded-[8px] bg-[hsl(var(--pv-sunken))] py-2 text-center">
                      <p className="text-[10px] font-bold text-[hsl(var(--pv-ink-3))]">{x.d}</p>
                      <p className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                        {errored ? '—' : x.n}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <AIInsightCard
                kind="opportunity"
                confidence="High confidence"
                body="Friday is 26% of total bookings and 3pm the highest-demand hour."
                recommendation="Schedule 8–9 of your 14 staff during the Friday 3pm peak. Reduce Saturday coverage to 3–4 staff (12 bookings) and strengthen Fri–Sun capacity."
                actionLabel="Open scheduler"
                error={errored}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
