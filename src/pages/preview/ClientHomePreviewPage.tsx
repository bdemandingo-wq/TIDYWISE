import { useState } from 'react';
import { Gift, Images } from 'lucide-react';
import {
  BookingRow,
  BottomNav,
  Button,
  CLIENT_NAV,
  Card,
  CardTitle,
  Eyebrow,
  InverseCard,
  LoyaltyBanner,
  PortalHeader,
  ShortcutCard,
  Skeleton,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screen 2b — Client home. Preview route only; static data, replaces nothing
 * live. Built from docs/mobile-design-spec.md §2 (2b), §3, §5 and §5.1.
 */

type Load = 'ready' | 'loading' | 'error';

const UPCOMING = [
  { weekday: 'Sat', day: '30', title: 'Standard Clean', meta: '10:00 AM · Maria G.' },
  { weekday: 'Sat', day: '06', title: 'Standard Clean', meta: '10:00 AM · Maria G.' },
  { weekday: 'Sat', day: '13', title: 'Deep Clean', meta: '9:00 AM · Unassigned' },
];

export default function ClientHomePreviewPage() {
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

      <PortalHeader
        eyebrow="Client portal"
        greeting="Hello, Bill"
        name="Bill Ochs"
        notifications={2}
        trailing="settings"
      />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        {/* ── NextAppointmentHero — the one inverse surface (§3 rule 2) ───── */}
        <InverseCard>
          <div className="flex items-start gap-3">
            <Eyebrow onInverse>Next appointment</Eyebrow>
            {state === 'ready' && (
              <span className="ml-auto">
                <StatusBadge tone="success" label="Confirmed" />
              </span>
            )}
          </div>

          {state === 'loading' ? (
            <>
              <Skeleton onInverse className="mt-2 h-[24px] w-2/3" />
              <Skeleton onInverse className="mt-2 h-3 w-1/2" />
              <div className="mt-3 flex gap-2">
                <Skeleton onInverse className="h-10 w-[120px] rounded-[12px]" />
                <Skeleton onInverse className="h-10 w-[88px] rounded-[12px]" />
              </div>
            </>
          ) : state === 'error' ? (
            /* §5.1: never the empty copy here — a client reading "no upcoming
               appointments" may rebook a visit that already exists. */
            <div role="alert">
              <p className="mt-1.5 text-[15px] font-extrabold text-[hsl(var(--pv-on-inverse))]">
                Couldn&rsquo;t load your appointment
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-link-on-inverse))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1.5 text-[22px] font-extrabold leading-tight text-[hsl(var(--pv-on-inverse))]">
                Saturday, Aug 30
              </p>
              <p className="mt-1 text-[11.5px] font-medium text-[hsl(var(--pv-on-inverse-muted))]">
                10:00 AM – 12:00 PM · Standard Clean · Maria G.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onInverse>
                  Reschedule
                </Button>
                <Button variant="ghost" onInverse>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </InverseCard>

        {/* ── LoyaltyBanner — first use of gold (§1.1b) ────────────────────
            §5.1: omitted entirely when not enrolled; on failure the bar is
            dropped, because a zero-width gold bar reads as lost points. */}
        {state === 'loading' ? (
          <Skeleton className="h-[92px] rounded-[14px]" />
        ) : (
          <LoyaltyBanner
            tier="Gold"
            points={1820}
            progress={62}
            nextTierHint="$3,310 more to reach Platinum"
            error={state === 'error'}
          />
        )}

        {/* ── UpcomingList ─────────────────────────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-3">
            <CardTitle>Upcoming</CardTitle>
            <button
              type="button"
              className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              See all
            </button>
          </div>

          {state === 'loading' ? (
            <div className="mt-3 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-[58px] w-[52px] rounded-[10px]" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="mt-1.5 h-2.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            <div role="alert" className="mt-2">
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load bookings
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {UPCOMING.map((b) => (
                <BookingRow key={b.day} {...b} action={{ label: 'Reschedule' }} />
              ))}
            </div>
          )}
        </Card>

        {/* ── ShortcutGrid ─────────────────────────────────────────────────── */}
        <div className="flex gap-3">
          <ShortcutCard
            icon={<Gift className="h-5 w-5" />}
            title="Refer a friend"
            sub="Both get $25"
          />
          <ShortcutCard
            icon={<Images className="h-5 w-5" />}
            title="Photo journal"
            sub="Before & after"
          />
        </div>
      </div>

      <BottomNav
        items={CLIENT_NAV}
        active="home"
        fab={{ label: 'Request a booking' }}
      />
    </main>
  );
}
