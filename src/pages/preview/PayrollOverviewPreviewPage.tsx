import { useState } from 'react';
import { InverseHeader, StatWell, NoteWell, Card } from '@/components/portal-v2';

/**
 * Screen 11c — Payroll Report, overview.
 *
 * Preview route only, static data. Additive.
 *
 * This is NOT the payroll screen already built. `PayrollPreviewPage` is 11d,
 * the per-cleaner staff list. 11c is the report that sits in front of it:
 * one period-level figure, three supporting stats, two alerts, and the
 * current and next pay periods. Reading the comps is what separated them —
 * the inventory had "payroll" as a single screen.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header    inverse surface. Eyebrow "Finance", title 16px/800, a CSV
 *             button at 11px/700 (padding 9/14, radius 10, hairline border).
 *   hero      label 11.5px/600 at .65 opacity; figure 32px/800 with the
 *             labour percentage beside it at 12px, baseline-aligned, 10px gap.
 *   wells     three equal chips, radius 12, padding 10/12, value 15px/800,
 *             caption 10px/600 at .65. The profit chip is green.
 *   alerts    radius 14, padding 12/16; title 12px/800, body 11.5px at
 *             line-height 1.5, 3px below.
 *   body      padding 16/20, 12px gaps.
 *
 * ── The two alerts are the point of the screen ────────────────────────
 *
 * Both are conditional and both are money-critical:
 *
 *   Negative margin — a booking whose labour cost exceeds its revenue. The
 *   business loses money on that job and nothing else on the payroll
 *   screens surfaces it.
 *   1099 filing — contractors past the $600 IRS threshold for the year. A
 *   compliance deadline, not a preference.
 *
 * They render only when the condition holds, so an org with neither sees
 * the report without them. Toggleable here to make both states checkable.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Every figure is money over a period. A failed read renders "—" and the
 * alerts are suppressed rather than shown as zero: "0 bookings have
 * negative profit" is a claim, and an unread alert is not an absent one.
 */


/* 11c's period card: title 14px/800 with the range as a 600-weight muted
   span, then a 2x2 grid of SUNKEN tiles (radius 12, padding 12/14) — value
   18px/800, caption 10.5px/600. Profit is green. Not label/value rows. */
function PeriodCard({
  title,
  range,
  tiles,
}: {
  title: string;
  range: string;
  tiles: { value: string; caption: string; positive?: boolean }[];
}) {
  return (
    <Card>
      <p className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
        {title} <span className="font-semibold text-[hsl(var(--pv-ink-3))]">· {range}</span>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {tiles.map(t => (
          <div key={t.caption} className="rounded-[12px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3">
            <p
              className={
                'text-[18px] font-extrabold tabular-nums ' +
                (t.positive ? 'text-[hsl(var(--pv-success))]' : 'text-[hsl(var(--pv-ink))]')
              }
            >
              {t.value}
            </p>
            <p className="text-[10.5px] font-semibold text-[hsl(var(--pv-ink-3))]">{t.caption}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

type Phase = 'ready' | 'no-alerts' | 'error';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Both alerts firing — a negative-margin booking and 10 contractors past the 1099 threshold.' },
  { id: 'no-alerts', label: 'No alerts', why: 'The same report for an org with neither condition. Alerts are conditional, not permanent furniture.' },
  { id: 'error', label: 'Error', why: 'Figures render "—" and alerts are SUPPRESSED. An unread alert is not an absent one.' },
];

export default function PayrollOverviewPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const errored = phase === 'error';
  const showAlerts = phase === 'ready';
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
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
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
          eyebrow="Finance"
          business="Payroll Report"
          revenueLabel="Total payroll · Aug 1–31"
          revenue={m('$5,949.50')}
          trend={errored ? undefined : { direction: 'down', label: '56.9% avg labor' }}
          error={errored}
          wells={
            <>
              <StatWell value={m('$10,452')} caption="revenue (net)" />
              <StatWell value={m('$4,369')} caption="profit" />
              <StatWell value={m('277.1')} caption="hours · 46 cleans" />
            </>
          }
        />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-4">
          {showAlerts && (
            <>
              <NoteWell tone="danger" label="↘ Negative margin alert">
                1 booking has negative profit — labor cost exceeds revenue.
              </NoteWell>
              <NoteWell tone="warn" label="⚠ 1099 tax filing required">
                10 contractors have earned $600+ this year and require 1099-NEC filing.
              </NoteWell>
            </>
          )}

          <PeriodCard
            title="Current pay period"
            range="Aug 15–21"
            tiles={[
              { value: m('$2,206.00'), caption: 'revenue (net)' },
              { value: m('$1,301.50'), caption: 'payroll' },
              { value: m('$904.50'), caption: 'profit · 59.0% labor', positive: !errored },
              { value: m('9'), caption: 'bookings' },
            ]}
          />

          <PeriodCard
            title="Next pay period"
            range="Aug 22–28"
            tiles={[
              { value: m('$2,428.00'), caption: 'revenue' },
              { value: m('$1,370.00'), caption: 'payroll' },
              { value: m('$1,058.00'), caption: 'profit', positive: !errored },
              /* A cleaner on next period's roster with no pay set —
                 isMissingPay, never $0.00. */
              { value: m('1'), caption: 'missing pay' },
            ]}
          />
        </div>
      </main>
    </div>
  );
}
