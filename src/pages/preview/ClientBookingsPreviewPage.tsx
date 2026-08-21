import { useState } from 'react';
import { Home, CalendarDays, MessageSquare, User } from 'lucide-react';
import { BottomNav, Button, StatusBadge, type NavItem } from '@/components/portal-v2';

/**
 * Screen 4a — Client portal, Bookings tab.
 *
 * Preview route only, static. Additive; the live PortalDashboardPage is
 * untouched.
 *
 * ── Measured from the comp ────────────────────────────────────────────────
 *
 *   title       20px/800 with an 11px meta line under it
 *   request     12px/800 pill on brand, 9px 16px
 *   filters     12px pills at 8px 16px; active is inverse-on-ink, the rest
 *               are surface with a 1px border
 *   next card   inverse, radius 16, padding 16/18; eyebrow 10.5px/700 at
 *               .06em; headline 19px/800; meta 12px; two 10px-radius buttons
 *   list row    radius 16, padding 14/18, 14px gap; 44px date column with a
 *               10px/700 month over a 19px/800 day; title 13.5px/700; meta
 *               11px; pill 10.5px/700 at 4px 10px
 *   divider     1px rules either side of a 10.5px/700 label at .05em
 *
 * ── Two places the comp is right and the live screen is not ───────────────
 *
 * 1. Cancelled gets its own filter. PortalDashboardPage.tsx:620 puts
 *    cancelled bookings into the PAST bucket alongside completed ones —
 *    `scheduled_at < now || status === 'cancelled' || status === 'completed'`.
 *    So a clean that never happened sits in the same list as cleans that did,
 *    and that list is the one offering "Rebook" and "Rate this clean". The
 *    comp separates them. Past here excludes cancelled, so nothing appears
 *    under two filters.
 *
 * 2. Pending is amber, not grey. StatusChip (PortalDashboardPage.tsx:199)
 *    maps pending to pv-chip-neutral. Grey reads as "nothing to do here",
 *    and pending is the one status on this screen that may need the customer
 *    to act. The comp gives it #9A5B13 on #FFF3E0 — amber — which becomes
 *    --pv-warn on --pv-warn-soft.
 *
 * ── "Cleaner TBD" is a real state and it stays visible ────────────────────
 *
 * The comp's Sep 6 row reads "Weekly · Cleaner TBD · $250". A customer
 * looking at an unassigned booking should be able to see it is unassigned;
 * that is the single most useful fact on the row. It is not padded out to
 * look assigned and not hidden.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────────
 *
 * "3 upcoming · Gold member" combines two independent reads. The tier comes
 * from loyalty, which can fail on its own, and claiming the wrong tier to a
 * customer is worse than claiming none — so each half drops independently
 * rather than the line rendering half-wrong. Money never renders 0.
 */

type Filter = 'upcoming' | 'past' | 'cancelled';
type Phase = 'ready' | 'error' | 'no-tier';

type Row = {
  mon: string;
  day: string;
  title: string;
  meta: string;
  badge?: { tone: 'success' | 'info' | 'warn' | 'danger'; label: string };
  action?: string;
};

const UPCOMING: Row[] = [
  {
    mon: 'Aug',
    day: '30',
    title: 'Deep Clean · 1:00 PM',
    meta: 'Weekly · Bruce Davis · $250',
    badge: { tone: 'info', label: 'Confirmed' },
  },
  {
    mon: 'Sep',
    day: '6',
    title: 'Deep Clean · 1:00 PM',
    /* Unassigned, and saying so is the point. */
    meta: 'Weekly · Cleaner TBD · $250',
    badge: { tone: 'warn', label: 'Pending' },
  },
];

const PAST: Row[] = [
  { mon: 'Aug', day: '16', title: 'Deep Clean · 1:00 PM', meta: 'Bruce Davis · $250 · ★★★★★', action: 'Rebook' },
  { mon: 'Aug', day: '9', title: 'Deep Clean · 1:00 PM', meta: 'Bruce Davis · $250 · Rate this clean', action: 'Rate' },
];

const CANCELLED: Row[] = [
  {
    mon: 'Jul',
    day: '26',
    title: 'Standard Clean · 9:00 AM',
    meta: 'Cancelled by you · refunded $180',
    badge: { tone: 'danger', label: 'Cancelled' },
  },
];

const CLIENT_TABS: NavItem[] = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'bookings', label: 'Bookings', Icon: CalendarDays },
  { id: 'messages', label: 'Messages', Icon: MessageSquare },
  { id: 'profile', label: 'Profile', Icon: User },
];

export default function ClientBookingsPreviewPage() {
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [phase, setPhase] = useState<Phase>('ready');

  const rows = filter === 'upcoming' ? UPCOMING : filter === 'past' ? PAST : CANCELLED;

  /* Two independent reads. Each drops on its own rather than the line
     rendering half-true — telling a customer they are the wrong tier is
     worse than telling them nothing. */
  const meta = [
    phase === 'error' ? null : `${UPCOMING.length} upcoming`,
    phase === 'ready' ? 'Gold member' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {(['ready', 'no-tier', 'error'] as Phase[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold ' +
              (phase === p
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p === 'no-tier' ? 'loyalty failed' : p}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {phase === 'no-tier'
            ? '"Gold member" is a separate read. It drops on its own — claiming the wrong tier to a customer is worse than claiming none.'
            : 'Cancelled has its own filter. Live folds it into Past, next to the cleans that DID happen and their Rebook buttons.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <header className="flex items-center px-5 pb-2.5 pt-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-extrabold text-[hsl(var(--pv-ink))]">Bookings</h1>
            {meta && (
              <p className="truncate text-[11px] text-[hsl(var(--pv-ink-3))]">{meta}</p>
            )}
          </div>
          <button
            type="button"
            className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-[hsl(var(--pv-brand))] px-4 py-[9px] text-[12px] font-extrabold text-[hsl(var(--pv-brand-ink))]"
          >
            + Request
          </button>
        </header>

        <div className="flex gap-2 px-5 pb-3.5 pt-1">
          {(['upcoming', 'past', 'cancelled'] as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={
                'rounded-full px-4 py-2 text-[12px] capitalize ' +
                (filter === f
                  ? 'bg-[hsl(var(--pv-ink))] font-bold text-[hsl(var(--pv-bg))]'
                  : 'border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] font-semibold text-[hsl(var(--pv-ink-2))]')
              }
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 px-5 pb-10">
          {phase === 'error' ? (
            <div className="rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-[18px]">
              <p className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
                Your bookings didn&rsquo;t load
              </p>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                This isn&rsquo;t an empty schedule — we couldn&rsquo;t read it.
                Your cleanings are unaffected.
              </p>
            </div>
          ) : (
            <>
              {filter === 'upcoming' && (
                <section className="rounded-[16px] bg-[hsl(var(--pv-inverse))] px-[18px] py-4 text-[hsl(var(--pv-on-inverse))]">
                  <div className="flex items-center">
                    <p className="text-[10.5px] font-bold tracking-[0.06em] text-[hsl(var(--pv-on-inverse-muted))]">
                      NEXT CLEANING
                    </p>
                    <span className="ml-auto rounded-full bg-[hsl(var(--pv-on-inverse)/0.1)] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-on-inverse))]">
                      Confirmed
                    </span>
                  </div>
                  <p className="mt-2 text-[19px] font-extrabold">Sun, Aug 23 · 1:00 PM</p>
                  <p className="mt-[3px] text-[12px] text-[hsl(var(--pv-on-inverse-muted))]">
                    Deep Clean · 180 min · Bruce Davis
                  </p>
                  {/* Equal halves, as the comp draws them. Button's fullWidth
                      is width:100% on the button itself, which is not the same
                      as being a flex child — measured 233px vs 56px before
                      this wrapper. */}
                  <div className="mt-3.5 flex gap-2">
                    <div className="flex-1">
                      <Button variant="primary" fullWidth className="rounded-[10px]">Manage</Button>
                    </div>
                    <button
                      type="button"
                      className="flex-1 rounded-[10px] border-[1.5px] border-[hsl(var(--pv-on-inverse)/0.25)] py-2.5 text-center text-[12px] font-bold text-[hsl(var(--pv-on-inverse))]"
                    >
                      Message
                    </button>
                  </div>
                </section>
              )}

              {filter === 'past' && (
                <div className="flex items-center gap-2 px-0.5 py-1">
                  <div className="h-px flex-1 bg-[hsl(var(--pv-border))]" />
                  <span className="text-[10.5px] font-bold tracking-[0.05em] text-[hsl(var(--pv-ink-4))]">
                    PAST
                  </span>
                  <div className="h-px flex-1 bg-[hsl(var(--pv-border))]" />
                </div>
              )}

              {rows.map(r => (
                <div
                  key={r.mon + r.day}
                  className="flex items-center gap-3.5 rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-[18px] py-3.5"
                >
                  <div className="w-11 shrink-0 text-center">
                    <p className="text-[10px] font-bold uppercase text-[hsl(var(--pv-ink-3))]">
                      {r.mon}
                    </p>
                    <p className="text-[19px] font-extrabold leading-tight text-[hsl(var(--pv-ink))]">
                      {r.day}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-[hsl(var(--pv-ink))]">
                      {r.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[hsl(var(--pv-ink-3))]">
                      {/* No mask here on purpose. If the bookings read fails
                          there are no rows at all, and a LOYALTY failure must
                          not blank out a price — that is the whole reason
                          these are treated as separate reads. */}
                      {r.meta}
                    </p>
                  </div>
                  {r.badge && (
                    <div className="shrink-0">
                      <StatusBadge tone={r.badge.tone} label={r.badge.label} />
                    </div>
                  )}
                  {r.action && (
                    <button
                      type="button"
                      className="shrink-0 whitespace-nowrap text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
                    >
                      {r.action}
                    </button>
                  )}
                </div>
              ))}

              {rows.length === 0 && (
                <p className="px-1 py-6 text-center text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                  Nothing here yet.
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-auto">
          <BottomNav items={CLIENT_TABS} active="bookings" />
        </div>
      </main>
    </div>
  );
}
