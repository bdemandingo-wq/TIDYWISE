import { useState } from 'react';
import { Home, CalendarDays, ClipboardList, Sparkles } from 'lucide-react';
import {
  AIInsightCard,
  BottomNav,
  Card,
  CardTitle,
  InverseHeader,
  Skeleton,
  StatCard,
  StatWell,
  TimelineRow,
  type NavItem,
} from '@/components/portal-v2';

/**
 * Screen 1b — Admin dashboard. Preview route only; static data, replaces
 * nothing live. From docs/mobile-design-spec.md §2 (1b), §3, §5 and §5.1.
 */

type Load = 'ready' | 'loading' | 'error';

const ADMIN_NAV: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'bookings', label: 'Bookings', Icon: ClipboardList },
  { id: 'ai', label: 'AI', Icon: Sparkles },
];

const SCHEDULE = [
  { time: '8:00 AM', title: 'Deep Clean · Schrank', meta: 'Maria G. · Fort Lauderdale', tone: 'brand' as const },
  { time: '11:30 AM', title: 'Standard Clean · Ochs', meta: 'Dee W. · Wilton Manors', tone: 'success' as const },
  { time: '2:00 PM', title: 'Move-out · Alvarez', meta: 'Unassigned · Oakland Park', tone: 'warn' as const },
];

export default function AdminDashboardPreviewPage() {
  const [state, setState] = useState<Load>('ready');

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Preview state
        </span>
        {(['ready', 'loading', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              state === s
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── InverseHeader — the one navy surface (§3 rule 2) ───────────────
          §5.1: $0.00 is a real answer for an empty period, but NEVER on a
          failed read — `error` replaces the figure rather than zeroing it. */}
      <InverseHeader
        eyebrow="Good morning"
        business="Clean Collective LLC"
        revenueLabel="Revenue · August"
        revenue={state === 'loading' ? undefined : '$18,420'}
        trend={state === 'ready' ? { direction: 'down', label: '4.2%' } : undefined}
        notifications={3}
        error={state === 'error'}
        wells={
          state === 'loading' ? (
            <>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} onInverse className="h-[52px] flex-1 rounded-[12px]" />
              ))}
            </>
          ) : state === 'error' ? (
            <>
              <StatWell value="—" caption="Bookings today" />
              <StatWell value="—" caption="Owed" />
              <StatWell value="—" caption="New leads" />
            </>
          ) : (
            <>
              <StatWell value="6" caption="Bookings today" />
              <StatWell value="$1,240" caption="Owed" />
              <StatWell value="4" caption="New leads" />
            </>
          )
        }
      />

      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-6 pt-3.5">
        {/* ── AIInsightCard — first use of accent.ai ────────────────────────
            §5.1: omitted entirely when there is no insight. */}
        {state === 'loading' ? (
          <Skeleton className="h-[120px] rounded-[16px]" />
        ) : (
          <AIInsightCard
            title="Three repeat clients lapsed"
            body="Schrank, Ochs and Alvarez have all gone 6+ weeks without rebooking, against a 3-week average. A rebooking nudge recovered 4 of 6 last month."
            urgent
            actionLabel="Review lapsed clients"
            error={state === 'error'}
          />
        )}

        {/* ── StatPairGrid ─────────────────────────────────────────────────
            §5.1: the churn stat must never show a red 0 on failure — on error
            it passes "—" with the default tone, not danger. */}
        <div className="flex gap-3.5">
          {state === 'loading' ? (
            <>
              <Skeleton className="h-[92px] flex-1 rounded-[16px]" />
              <Skeleton className="h-[92px] flex-1 rounded-[16px]" />
            </>
          ) : state === 'error' ? (
            <>
              <StatCard label="Churn" value="—" caption="Couldn't load" />
              <StatCard label="Repeat rate" value="—" caption="Couldn't load" />
            </>
          ) : (
            <>
              <StatCard label="Churn" value="7.4%" caption="Up from 5.1%" tone="danger" />
              <StatCard label="Repeat rate" value="68%" caption="Last 90 days" />
            </>
          )}
        </div>

        {/* ── TodayScheduleCard ────────────────────────────────────────────
            §5.1: on error the header link still works. */}
        <Card>
          <div className="flex items-center gap-3">
            <CardTitle>Today</CardTitle>
            <button
              type="button"
              className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              Calendar
            </button>
          </div>

          {state === 'loading' ? (
            <div className="mt-3 flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-3 w-[52px]" />
                  <Skeleton className="h-[46px] flex-1 rounded-[10px]" />
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            <div role="alert" className="mt-2">
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load today&rsquo;s schedule
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {SCHEDULE.map((r) => (
                <TimelineRow key={r.time} {...r} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <BottomNav items={ADMIN_NAV} active="home" fab={{ label: 'New booking', tone: 'inverse' }} />
    </main>
  );
}
