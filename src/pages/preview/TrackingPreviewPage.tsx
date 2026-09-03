import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  SettingsGroup,
  SettingsRow,
  Card,
  CardTitle,
} from '@/components/portal-v2';

/**
 * Screen 6c — Live Tracking.
 *
 * Preview route only, static data. Additive.
 *
 * ── There is no map ───────────────────────────────────────────────────
 *
 * My inventory called this "the only map screen in the app. Needs a
 * full-bleed pattern nothing else uses." The comp has no map at all. It is
 * a stat header, a group of notification toggles, and two empty states.
 * Every part already existed as a component.
 *
 * That is worth stating plainly because it was the single hardest item on
 * the REAL DESIGN list, and it dissolved on contact with the comp. The map
 * was my assumption, not the design.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header    inverse, four wells (radius 12, padding 10/12, value 17px/800,
 *             caption 10px/600 at .65)
 *   card      radius 16, padding 16/18, 11px gaps
 *   title     14px/800
 *   toggle    label 12.5px/700 taking the row; switch 40x24, radius 99,
 *             brand when on, 18px knob inset 3px
 *
 * ── Why the empty state is the screen ─────────────────────────────────
 *
 * The comp ships showing zero cleaners en route, and that is the honest
 * default: most of the day, nobody is driving. So the empty state is not an
 * edge case here, it is the resting state, and it has to explain how the
 * screen fills — "Active tracking appears here when a cleaner presses On My
 * Way". That sentence is the difference between a screen that looks broken
 * and one that looks ready.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * "No cleaners en route" and "could not load tracking" are the same picture
 * and opposite meanings, so they read differently here. The counts render
 * "—" on a failed read rather than 0, because "0 cleaners en route" during
 * a working morning is a claim that everyone is late.
 */

type Phase = 'idle' | 'active' | 'error';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'idle', label: 'Nobody en route', why: 'The resting state, and what the comp ships. It explains how the screen fills rather than looking broken.' },
  { id: 'active', label: 'Two en route', why: 'Cleaners driving now, with their job and ETA.' },
  { id: 'error', label: 'Error', why: 'Counts render "—", not 0. "0 en route" on a working morning claims everyone is late.' },
];

const EN_ROUTE = [
  { name: 'Bruce Wayne', job: 'Deep Clean · Bill Ohlsen', eta: '12 min' },
  { name: 'Ana Ruiz', job: 'Standard Clean · Robert Washington', eta: '27 min' },
];

export default function TrackingPreviewPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const errored = phase === 'error';
  const active = phase === 'active';
  const m = (v: string) => (errored ? '—' : v);

  const [notifyAdminOnWay, setNotifyAdminOnWay] = useState(true);
  const [notifyClientOnWay, setNotifyClientOnWay] = useState(true);
  const [includeEta, setIncludeEta] = useState(true);
  const [notifyClientArrived, setNotifyClientArrived] = useState(true);
  const [notifyAdminArrived, setNotifyAdminArrived] = useState(false);

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
          eyebrow="Tracking"
          business="Live Tracking"
          revenueLabel="Cleaners en route"
          revenue={m(active ? '2' : '0')}
          error={errored}
          wells={
            <>
              {/* "completed routes today" clipped to "completed route…" at this
                  width, losing the word that scopes it. Shortened rather than
                  truncated — same fact, no ellipsis. */}
              <StatWell value={m('0')} caption="routes today" />
              <StatWell value={m('5')} caption="alerts on" />
              <StatWell value={m('ETA')} caption="in client SMS" />
            </>
          }
        />

        <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
          <SettingsGroup title="Notifications" state="ready">
            <SettingsRow
              kind="toggle"
              label="Notify admin — cleaner on my way"
              checked={notifyAdminOnWay}
              onCheckedChange={setNotifyAdminOnWay}
            />
            <SettingsRow
              kind="toggle"
              label="Notify client — cleaner on my way"
              checked={notifyClientOnWay}
              onCheckedChange={setNotifyClientOnWay}
            />
            <SettingsRow
              kind="toggle"
              label="Include distance & ETA in client SMS"
              checked={includeEta}
              onCheckedChange={setIncludeEta}
            />
            <SettingsRow
              kind="toggle"
              label="Notify client — cleaner arrived"
              checked={notifyClientArrived}
              onCheckedChange={setNotifyClientArrived}
            />
            <SettingsRow
              kind="toggle"
              label="Notify admin — cleaner arrived"
              checked={notifyAdminArrived}
              onCheckedChange={setNotifyAdminArrived}
            />
          </SettingsGroup>

          <Card>
            {errored ? (
              <div role="alert">
                <CardTitle>Couldn&rsquo;t load tracking</CardTitle>
                <p className="mt-2 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  Cleaners on their way are unaffected — this device just
                  couldn&rsquo;t fetch their positions.
                </p>
              </div>
            ) : active ? (
              <>
                <CardTitle>On the way now</CardTitle>
                <div className="mt-2.5 flex flex-col gap-2.5">
                  {EN_ROUTE.map(c => (
                    <div
                      key={c.name}
                      className="flex items-center gap-3 rounded-[12px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                          {c.name}
                        </span>
                        <span className="block truncate text-[10.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                          {c.job}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-[hsl(var(--pv-brand))]">
                        {c.eta}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-3 text-center">
                <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">
                  No cleaners currently en route
                </p>
                {/* The sentence that makes an empty screen read as ready
                    rather than broken. Straight from the comp. */}
                <p className="mt-1 text-[11.5px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                  Active tracking appears here when a cleaner presses
                  &ldquo;On My Way&rdquo;.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Today&rsquo;s completed routes</CardTitle>
            <p className="mt-2 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
              {errored ? "Couldn't load" : 'None yet'}
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
