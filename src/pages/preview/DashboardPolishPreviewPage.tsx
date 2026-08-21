import { useState } from 'react';
import { Home, CalendarDays, ClipboardList, BarChart3, Menu, Bell } from 'lucide-react';
import { BottomNav, Sparkline, type NavItem } from '@/components/portal-v2';

/**
 * Screen 1a — Dashboard, "polish of current layout".
 *
 * Preview route only, static. Additive. This is NOT the 1b dashboard that
 * already lives at /dashboard/preview/admin — 1b is the modernized "AI up
 * front" rethink, 1a keeps the current layout and tightens it. Both comps
 * exist, so both routes do.
 *
 * ── Measured from the comp ────────────────────────────────────────────────
 *
 *   header      36px square controls, radius 10, 1px border; title 19px/800
 *   stat strip  one card, radius 16, padding 16/18, three columns, gap 8,
 *               columns 2-3 divided by a 1px left border + 14px padding
 *               label 11px/600 · value 20px/800 (3px above) · caption 10.5px
 *   cards       radius 16, padding 18, 1px border, 14px apart
 *   section     title 15px/700, action 11.5px/600 brand
 *   range chips 11px/600, 5px 10px, pill; active 11px/700 on brand, 5px 12px
 *   headline    label 12px muted, value 26px/800, chart 72px, axis 10px
 *   booking row 4×38px rail at radius 2 · title 13.5px/700 · meta 11.5px
 *               · pill 10.5px/700 at 4px 9px
 *
 * The comp's rails are #2B5CE6 / #129E6A / #6C5CE7 per service. Those are the
 * rejected blue, the rejected green, and a purple, so they translate to
 * --pv-brand / --pv-success / --pv-ai rather than being copied.
 *
 * ── One deliberate divergence: the period row keeps all seven ─────────────
 *
 * The comp draws five chips — 1W, 4W, 1Y, YTD, ALL. The real control has
 * SEVEN: ReportsOverview.tsx:44 is ['1W','4W','1Y','MTD','QTD','YTD','ALL'].
 * The comp quietly drops MTD and QTD to make the row fit 390px.
 *
 * Dropping a displayed fact is recoverable — the reader can tell something is
 * summarised and follow "Details →". Dropping a CONTROL is not: nothing on
 * screen indicates the missing periods ever existed, so a user who wants
 * month-to-date simply concludes the product cannot do it. All seven are here
 * and the row wraps.
 *
 * Wrapping rather than scrolling is the second half of that. The live row is
 * `overflow-x-auto` with `no-scrollbar` (ReportsOverview.tsx:235) — a
 * horizontally scrolling strip with its scrollbar deliberately hidden, so at
 * 390px the later options sit off-screen with no affordance pointing at them.
 * Same finding as the SegmentedTabs wrap fix, in a different component.
 *
 * ── §5.1: the two zeroes in the comp are the whole problem ────────────────
 *
 * The comp shows "Payments 0 received" and "New 0 customers" beside "Today
 * $753 gross". A quiet Tuesday and a broken request render identically, and
 * one of those three is money. So on a failed read none of them renders a
 * number, and the chart takes null rather than a flat line — a line along the
 * bottom of a revenue chart does not read as "no data".
 */

type Phase = 'ready' | 'loading' | 'error';
type Period = '1W' | '4W' | '1Y' | 'MTD' | 'QTD' | 'YTD' | 'ALL';

/* Every period the live control offers. Not the comp's five. */
const PERIODS: Period[] = ['1W', '4W', '1Y', 'MTD', 'QTD', 'YTD', 'ALL'];

const GROSS = [18, 34, 29, 62, 38, 41, 57, 49, 71, 64, 83, 78];

const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: Home },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { id: 'reports', label: 'Reports', Icon: BarChart3 },
];

/* The comp packs "name · time · date" onto one meta line. Measured at 390px
   that clips, and the DATE is what falls off — on a list headed "Upcoming"
   the day is the fact a reader is actually scanning for. Split onto two
   lines rather than dropped. Same finding as the ListRow `lines` slot. */
const UPCOMING = [
  { title: 'Standard Clean', who: 'Gary George · 9:00 AM', day: 'Wed, Aug 19', rail: 'brand' },
  { title: 'Standard Clean', who: 'Robert Washington · 11:00 AM', day: 'Wed, Aug 19', rail: 'success' },
  { title: 'Deep Clean', who: 'Jared Lampkin · 1:00 PM', day: 'Wed, Aug 19', rail: 'ai' },
] as const;

const RAIL: Record<string, string> = {
  brand: 'bg-[hsl(var(--pv-brand))]',
  success: 'bg-[hsl(var(--pv-success))]',
  ai: 'bg-[hsl(var(--pv-ai))]',
};

export default function DashboardPolishPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [period, setPeriod] = useState<Period>('ALL');

  const ready = phase === 'ready';
  const m = (v: string) => (ready ? v : '—');

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {(['ready', 'loading', 'error'] as Phase[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold capitalize ' +
              (phase === p
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {phase === 'error'
            ? 'The comp shows "0 payments" and "0 customers" next to money. A quiet day and a broken read must not look the same.'
            : 'Seven period chips, not the comp’s five — it drops MTD and QTD. Dropping a control is not recoverable the way dropping a displayed fact is.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <header className="flex items-center gap-3 px-5 pb-3.5 pt-2.5">
          <button
            type="button"
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))]"
          >
            <Menu className="h-4 w-4" />
          </button>
          <h1 className="flex-1 text-[19px] font-extrabold text-[hsl(var(--pv-ink))]">
            Dashboard
          </h1>
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))]"
          >
            <Bell className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[hsl(var(--pv-brand))] text-[13px] font-bold text-[hsl(var(--pv-brand-ink))]">
            TW
          </div>
        </header>

        <div className="flex flex-col gap-3.5 px-5">
          {/* Three columns divided by rules, exactly as the comp draws it. */}
          <div className="grid grid-cols-3 gap-2 rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-[18px] py-4">
            {[
              { label: 'Today', value: m('$753'), caption: 'gross' },
              { label: 'Payments', value: m('0'), caption: 'received' },
              { label: 'New', value: m('0'), caption: 'customers' },
            ].map((s, i) => (
              <div
                key={s.label}
                className={
                  i > 0
                    ? 'border-l border-[hsl(var(--pv-border))] pl-3.5'
                    : undefined
                }
              >
                <p className="text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]">
                  {s.label}
                </p>
                <p className="mt-[3px] text-[20px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                  {s.value}
                </p>
                <p className="text-[10.5px] text-[hsl(var(--pv-ink-3))]">{s.caption}</p>
              </div>
            ))}
          </div>

          <section className="rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-[18px]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[hsl(var(--pv-ink))]">
                Reports overview
              </h2>
              <button
                type="button"
                className="text-[11.5px] font-semibold text-[hsl(var(--pv-brand))]"
              >
                Details →
              </button>
            </div>

            {/* Wraps. The live row scrolls with a hidden scrollbar, so the
                later periods are unreachable-looking at 390px. */}
            <div className="mb-1 mt-3 flex flex-wrap gap-1">
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

            <p className="mt-2 text-[12px] text-[hsl(var(--pv-ink-3))]">
              {ready ? 'Gross volume · Dec 2025 – Aug 2026' : 'Gross volume'}
            </p>
            <p className="mb-2 mt-0.5 text-[26px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
              {m('$85.16K')}
            </p>

            {/* null on failure — a revenue line drawn along the bottom reads
                as a collapse, not as an absent read. */}
            <Sparkline
              points={ready ? GROSS : null}
              height={72}
              label="Gross volume, December 2025 to August 2026"
              caption={phase === 'loading' ? 'Loading…' : 'Chart unavailable'}
            />

            {ready && (
              <div className="mt-1 flex justify-between text-[10px] text-[hsl(var(--pv-ink-4))]">
                {['Dec', 'Feb', 'Apr', 'Jun', 'Aug'].map(mo => (
                  <span key={mo}>{mo}</span>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-[18px]">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-[hsl(var(--pv-ink))]">
                Upcoming bookings
              </h2>
              <button
                type="button"
                className="text-[11.5px] font-semibold text-[hsl(var(--pv-brand))]"
              >
                View all →
              </button>
            </div>

            {phase === 'error' ? (
              <p className="text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                Today&rsquo;s schedule didn&rsquo;t load. It isn&rsquo;t empty —
                it&rsquo;s unread.
              </p>
            ) : phase === 'loading' ? (
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                Loading today&rsquo;s schedule…
              </p>
            ) : (
              UPCOMING.map(b => (
                <div key={b.who} className="flex items-center gap-3">
                  <div className={`w-1 shrink-0 self-stretch rounded-[2px] ${RAIL[b.rail]}`} />
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="truncate text-[13.5px] font-bold text-[hsl(var(--pv-ink))]">
                      {b.title}
                    </p>
                    <p className="truncate text-[11.5px] text-[hsl(var(--pv-ink-3))]">
                      {b.who}
                    </p>
                    <p className="truncate text-[11.5px] text-[hsl(var(--pv-ink-3))]">
                      {b.day}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[hsl(var(--pv-brand-soft))] px-[9px] py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand))]">
                    Scheduled
                  </span>
                </div>
              ))
            )}
          </section>
        </div>

        <div className="h-3.5" />
        <div className="mt-auto">
          <BottomNav
            items={ADMIN_NAV}
            active="dashboard"
            fab={{ label: 'New booking', tone: 'primary' }}
          />
        </div>
      </main>
    </div>
  );
}
