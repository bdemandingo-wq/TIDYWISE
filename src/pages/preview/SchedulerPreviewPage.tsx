import { useState } from 'react';
import {
  CalendarMonth,
  TimelineRow,
  Card,
  StatWell,
  InverseHeader,
  isoParts,
} from '@/components/portal-v2';

/**
 * Screens 6a / 6b — Scheduler, month and week.
 *
 * Preview route only, static data. Additive; the live /dashboard/scheduler is
 * untouched.
 *
 * ── The comp is much simpler than the inventory claimed ───────────────
 *
 * My own inventory filed this under REAL DESIGN: "a scheduler needs
 * time-axis layout, overlapping events, drag. Genuinely different." 6a is
 * none of that. It is a month grid with dots, and a day agenda beneath it.
 * Both halves already existed as components — CalendarMonth (built for the
 * 1c/3b date pickers) and TimelineRow. This screen is assembly, and the
 * design problem I had reserved for it does not exist.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   grid card   radius 16, padding 14/12
 *   weekday row 7 columns, 2px gaps, 10px/700 muted, 8px below
 *   day cell    padding 6px 0; date 11px/700; a 5px dot 4px under it,
 *               several sitting in a 2px-gap row
 *   selected    brand-soft fill
 *   agenda card radius 16, padding 16/18, 11px gaps
 *   agenda head 14px/800 title, "Week view →" at 11.5px/600 in brand
 *   agenda row  time 11px/700 in a 52px column; block with a 3px left rail,
 *               radius 8, padding 8/10; title 12.5px/700, sub 10.5px
 *
 * ── What the dots are for ─────────────────────────────────────────────
 *
 * They are the whole reason a scheduler month differs from a date picker:
 * the picker asks "which day do you want", the scheduler answers "which
 * days already have work, and what kind". So the dots are colour-coded by
 * service accent and a day can carry several. CalendarMonth renders them
 * only when `events` is passed, so the two picker screens are unaffected.
 *
 * Past days keep their dots. The picker disables them because you cannot
 * book yesterday; the scheduler still needs to show that yesterday had
 * three cleans.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * An unassigned booking is a real, actionable state the comp calls out
 * ("2 unassigned"), and it is not an error. A failed read is: the counts
 * render "—" and the agenda says so rather than showing an empty day, which
 * would read as "nothing is booked".
 */

type Phase = 'ready' | 'empty-day' | 'error';

/* ISO -> the accents of that day's bookings. */
const EVENTS: Record<string, Array<'brand' | 'success' | 'ai' | 'orange'>> = {
  '2026-08-16': ['orange'],
  '2026-08-17': ['success'],
  '2026-08-18': ['orange'],
  '2026-08-19': ['brand', 'ai'],
  '2026-08-20': ['brand', 'ai', 'success'],
  '2026-08-21': ['brand', 'brand'],
  '2026-08-24': ['success'],
  '2026-08-26': ['brand', 'success'],
  '2026-08-28': ['ai'],
};

const AGENDA: { time: string; title: string; meta: string; tone: 'brand' | 'ai' | 'success' }[] = [
  { time: '9:00 AM', title: 'Standard Clean · Gary George', meta: 'Laura Gomez · Jupiter', tone: 'brand' },
  { time: '1:00 PM', title: 'Deep Clean · Robert Washington', meta: 'Bruce Davis · Boca Raton', tone: 'ai' },
  /* The comp's third entry has no cleaner — "Assign cleaner" rather than a
     name. Unassigned is a state to act on, not a blank. */
  { time: '3:00 PM', title: 'Airbnb Turnover · Jared Lampkin', meta: 'Assign cleaner', tone: 'success' },
];

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Dots mark days with work, colour-coded by service. Aug 20 carries three.' },
  { id: 'empty-day', label: 'Free day', why: 'A day with nothing booked — genuinely free, and it says so rather than looking broken.' },
  { id: 'error', label: 'Error', why: 'Counts render "—" and the agenda says it could not load. An empty day would read as "nothing is booked".' },
];

export default function SchedulerPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [selected, setSelected] = useState('2026-08-20');
  const errored = phase === 'error';
  const agenda = phase === 'ready' ? AGENDA : [];
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
          eyebrow="Scheduler"
          business="August 2026"
          revenueLabel="Bookings this month"
          revenue={m('58')}
          error={errored}
          wells={
            <>
              <StatWell value={m('7')} caption="this week" />
              <StatWell value={m('2')} caption="unassigned" />
            </>
          }
        />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-4">
          <Card className="px-3 py-3.5">
            <CalendarMonth
              value={selected}
              today="2026-08-21"
              onChange={setSelected}
              label="Scheduler month"
              events={errored ? undefined : EVENTS}
              variant="scheduler"
            />
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
                {isoParts(selected).label}
              </p>
              <button
                type="button"
                className="text-[11.5px] font-semibold text-[hsl(var(--pv-brand))]"
              >
                Week view →
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-[11px]">
              {errored ? (
                <p role="alert" className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                  Couldn&rsquo;t load this day. Your bookings are unaffected.
                </p>
              ) : agenda.length === 0 ? (
                <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                  Nothing booked this day.
                </p>
              ) : (
                agenda.map(a => (
                  <TimelineRow key={a.time} time={a.time} title={a.title} meta={a.meta} tone={a.tone} />
                ))
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
