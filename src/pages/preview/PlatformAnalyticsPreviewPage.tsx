import { useState } from 'react';
import {
  Card,
  CardTitle,
  StatCard,
  DetailHeader,
  Sparkline,
  ListRow,
  SettingsRow,
} from '@/components/portal-v2';

/**
 * Screen 5r — Platform Analytics (super-admin only).
 *
 * Preview route only, static data. Additive.
 *
 * The comp: hamburger + "Platform Analytics" + refresh, then Total signups
 * 424 / +27 last 30 days / 97 organizations / 1 subscribed / 4% conversion,
 * a "Signups over time" line with a "Details →" drill-in, and a "Last
 * updated" stamp.
 *
 * ── Two live bugs on the real screen, both reproduced by the comp ─────────
 *
 * 1. "Last updated" is wrong on the live page. PlatformAnalyticsPage.tsx:438
 *    renders `format(new Date(), 'MMM d, h:mm a')` — evaluated at RENDER time,
 *    not at fetch time. It therefore reads "now" on every re-render no matter
 *    how old the data is, so a stale payload from twenty minutes ago claims to
 *    be current. The stamp exists precisely to tell you whether to trust the
 *    numbers, which makes this the one field where being confidently wrong is
 *    worse than being absent. Here the stamp comes from the fetch, and says
 *    so.
 *
 * 2. Conversion rate zeroes on failure. PlatformAnalyticsPage.tsx:422 reads
 *    `analytics?.organizations.total ? ...round(...) : 0`, so a failed or
 *    still-loading read renders a confident "0%". Conversion at 0% is a
 *    judgement on the whole business, and the wrong one to make from a broken
 *    request. It is the same shape as 9b's close rate: a ratio is suppressed,
 *    never zeroed.
 *
 * ── "1 subscribed" and "4% conversion" are not the same set ───────────────
 *
 * They look contradictory — 1 of 97 is 1%, not 4% — and they are both right.
 * The live formula is (subscriptions.active + subscriptions.trialing) /
 * organizations.total, while "subscribed" counts active only. With three
 * accounts on trial, 4/97 rounds to 4%. Two different numerators over two
 * different denominators, presented adjacent with no hint that they differ.
 *
 * So the captions name their own sets — "paying now" vs "paying or on
 * trial" — rather than leaving the reader to reconcile two figures that
 * cannot be reconciled from what is on screen. Nothing is dropped; the
 * relationship is stated.
 *
 * ── Signups counts staff, organizations does not ──────────────────────────
 *
 * The live comment at :421 says the conversion denominator is organizations
 * "not total signups which include staff". That is a real and easily-missed
 * distinction: 424 signups against 97 organizations is mostly cleaners being
 * invited, not 327 businesses that failed to convert. The caption says it.
 */

type Phase = 'ready' | 'loading' | 'error';

/* Weekly signups, most recent last. Static — this is a preview. */
const SIGNUPS = [12, 9, 14, 11, 18, 16, 22, 19, 27, 24, 31, 27];

const RECENT_ORGS = [
  { name: 'Crossfit Wynwood', when: 'Aug 19', owner: 'bill@crossfitwynwood.com' },
  { name: 'Sparkle Maids LLC', when: 'Aug 18', owner: 'ops@sparklemaids.co' },
  { name: 'Blue Wave Cleaning', when: 'Aug 16', owner: 'hello@bluewaveclean.com' },
];

export default function PlatformAnalyticsPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [detail, setDetail] = useState(false);

  const ready = phase === 'ready';
  /* Every figure goes through this. On a failed read the screen must not be
     able to render a number at all. */
  const m = (v: string) => (ready ? v : '—');

  /* The stamp is the fetch time, captured with the data — not render time.
     Static here because this is a preview; the point is that it is a value
     travelling with the payload rather than a call to the clock in JSX. */
  const fetchedAt = ready ? 'Aug 19, 2:05 AM' : null;

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
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]'
                : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {phase === 'error'
            ? 'Conversion is SUPPRESSED, not zeroed — live renders a confident 0%. And the chart shows an empty frame, never a flat line along the bottom.'
            : '"Last updated" is the FETCH time. Live computes it at render time, so stale data claims to be current.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        {detail ? (
          <>
            <DetailHeader title="Recent signups" onBack={() => setDetail(false)} />
            <div className="flex flex-col gap-2.5 px-5 pb-10 pt-1">
              {RECENT_ORGS.map(o => (
                <ListRow
                  key={o.name}
                  title={o.name}
                  meta={o.when}
                  lines={[o.owner]}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <DetailHeader title="Platform Analytics" />

            <div className="flex flex-col gap-3.5 px-5 pb-10 pt-1">
              {phase === 'error' && (
                <Card>
                  <CardTitle>Analytics didn&rsquo;t load</CardTitle>
                  <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                    The platform-analytics function didn&rsquo;t respond. These are
                    the only numbers nobody can cross-check elsewhere, so none of
                    them are shown rather than shown wrong.
                  </p>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <StatCard
                  label="Total signups"
                  value={phase === 'loading' ? '—' : m('424')}
                  caption={ready ? '+27 last 30 days' : 'includes staff'}
                />
                <StatCard
                  label="Organizations"
                  value={phase === 'loading' ? '—' : m('97')}
                  caption="businesses, not staff"
                />
                <StatCard
                  label="Subscribed"
                  value={phase === 'loading' ? '—' : m('1')}
                  caption="paying now"
                />
                {/* A ratio. Suppressed on failure — never a confident 0%. */}
                <StatCard
                  label="Conversion"
                  value={ready ? '4%' : '—'}
                  caption="paying or on trial"
                />
              </div>

              <Card>
                <div className="flex items-center gap-2">
                  <CardTitle>Signups over time</CardTitle>
                  <button
                    type="button"
                    className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
                    onClick={() => setDetail(true)}
                  >
                    Details →
                  </button>
                </div>
                <div className="mt-3">
                  {/* null, not zeroes — a line drawn along the bottom would
                      read as a collapse in signups rather than a failed read. */}
                  <Sparkline
                    points={ready ? SIGNUPS : null}
                    label="Weekly signups over the last 12 weeks"
                    caption={
                      phase === 'loading' ? 'Loading…' : 'Trend unavailable'
                    }
                  />
                </div>
                <p className="mt-2 text-[11px] font-medium text-[hsl(var(--pv-ink-3))]">
                  {ready ? 'Weekly, last 12 weeks' : 'Weekly, last 12 weeks'}
                </p>
              </Card>

              <Card>
                <CardTitle>Breakdown</CardTitle>
                <div className="mt-1">
                  <SettingsRow kind="value" label="Active" value={m('1')} />
                  <SettingsRow kind="value" label="Trialing" value={m('3')} />
                  <SettingsRow kind="value" label="Canceled" value={m('6')} />
                </div>
              </Card>

              {/* The stamp travels with the payload. If there is no payload
                  there is no stamp — an absent stamp is honest, a "now" stamp
                  on stale data is not. */}
              <p className="px-1 text-[11px] font-medium text-[hsl(var(--pv-ink-3))]">
                {fetchedAt
                  ? `Last updated ${fetchedAt}`
                  : 'Not updated — last read didn’t complete'}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
