import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  Card,
  CardTitle,
  ChoiceRow,
  SettingsRow,
  SettingsGroup,
} from '@/components/portal-v2';

/**
 * Screens 5b / 5c / 5t — Notification Center and its event categories.
 *
 * Preview route only, static data. Additive.
 *
 * 5b is the centre: a preset chooser plus the categories. 5c and 5t are
 * those categories opened — bookings, and jobs/payments/leads. Same shape,
 * different contents, so the category view is one component driven by
 * which category you tapped.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header    inverse; "NOTIFICATIONS ENABLED 54", "across 6 of 6 channels";
 *             wells for events active and channels
 *   presets   four choices, each with a line saying what it does; Balanced
 *             carries a "Recommended" badge
 *   category  event rows with a channel COUNT rather than a toggle — the
 *             row leads somewhere rather than switching something
 *
 * ── Two lines carried verbatim ────────────────────────────────────────
 *
 * "Choose a setup, then customize any event." — tells you the presets are
 * a starting point, not a cage. Without it, picking one looks like giving
 * up per-event control.
 *
 * "Turning things off never deletes data." — the third reassurance of this
 * kind in the comps, after 5e's "editing a message never turns its
 * automation on" and 5f's "may be down". Whoever wrote these understood
 * that the fear stopping someone touching a settings screen is usually
 * about consequences they cannot see. Each line names the consequence that
 * ISN'T happening.
 *
 * ── The presets needed a component change ─────────────────────────────
 *
 * ChoiceRow had label + selected only. Choosing between "Action required
 * only", "Balanced", "Everything" and "Custom" without their descriptions
 * is guessing, so it gained `description` and `badge`. The descriptions
 * are the difference between a choice and a coin flip.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A channel count that could not be read renders "—", not 0. "0 channels"
 * on an event says nobody will be told when it happens — a specific and
 * alarming claim, and the wrong one to make about a failed read.
 */

type Preset = 'action' | 'balanced' | 'everything' | 'custom';

const CATEGORIES = [
  { id: 'bookings', label: 'Bookings', active: '13 of 13' },
  { id: 'jobs', label: 'Jobs', active: '8 of 9' },
  { id: 'payments', label: 'Payments', active: '6 of 6' },
  { id: 'leads', label: 'Leads', active: '4 of 5' },
  { id: 'staff', label: 'Staff', active: '5 of 7' },
  { id: 'customers', label: 'Customers & portal', active: '3 of 4' },
];

const BOOKING_EVENTS = [
  { label: 'New booking request', channels: 6 },
  { label: 'Booking confirmed', channels: 2 },
  { label: 'Booking cancelled', channels: 3 },
  { label: 'Booking rescheduled', channels: 2 },
  { label: 'Unassigned booking', channels: 2 },
  { label: 'Cleaner assigned', channels: 1 },
];

export default function NotificationsPreviewPage() {
  const [preset, setPreset] = useState<Preset>('custom');
  const [open, setOpen] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [morning, setMorning] = useState(true);
  const [evening, setEvening] = useState(false);
  const m = (v: string) => (errored ? '—' : v);

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        <button
          type="button"
          onClick={() => setErrored(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
            (errored
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-on-brand))]'
              : 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]')
          }
        >
          {errored ? 'Error' : 'Ready'}
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-full bg-[hsl(var(--pv-card))] px-3 py-1 text-[11px] font-bold text-[hsl(var(--pv-ink-2))]"
          >
            ← Back to centre
          </button>
        )}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {errored
            ? 'Channel counts render "—", never 0. "0 channels" says nobody will be told when the event happens.'
            : 'Tap a category to open it — that is 5c/5t, the same shape with different contents.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        {open === null ? (
          <>
            <InverseHeader
              eyebrow="Notifications"
              business="Notification Center"
              revenueLabel="Notifications enabled"
              revenue={m('54')}
              error={errored}
              wells={
                <>
                  <StatWell value={m('13')} caption="events active" />
                  <StatWell value={m('6')} caption="channels" />
                </>
              }
            />

            <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
              <Card>
                <CardTitle>Notification setup</CardTitle>
                {/* Both verbatim. The first says the presets are a starting
                    point; the second names the consequence that is NOT
                    happening, which is what actually unblocks someone. */}
                <p className="mt-1 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  Choose a setup, then customize any event. Turning things off
                  never deletes data.
                </p>

                <div className="mt-3 flex flex-col gap-2">
                  <ChoiceRow
                    label="Action required only"
                    description="Only alerts that need a response."
                    selected={preset === 'action'}
                    onClick={() => setPreset('action')}
                  />
                  <ChoiceRow
                    label="Balanced"
                    badge="Recommended"
                    description="Key events across sensible channels."
                    selected={preset === 'balanced'}
                    onClick={() => setPreset('balanced')}
                  />
                  <ChoiceRow
                    label="Everything"
                    description="Every event, on every channel."
                    selected={preset === 'everything'}
                    onClick={() => setPreset('everything')}
                  />
                  <ChoiceRow
                    label="Custom"
                    description="Your own per-event choices."
                    selected={preset === 'custom'}
                    onClick={() => setPreset('custom')}
                  />
                </div>
              </Card>

              <SettingsGroup title="Event categories" state="ready">
                {CATEGORIES.map(c => (
                  <SettingsRow
                    key={c.id}
                    kind="value"
                    label={c.label}
                    value={m(c.active)}
                    onClick={() => setOpen(c.id)}
                  />
                ))}
              </SettingsGroup>
            </div>
          </>
        ) : (
          <>
            <InverseHeader
              eyebrow="Notifications"
              business={CATEGORIES.find(c => c.id === open)?.label ?? ''}
              revenueLabel="Events active"
              revenue={m('13 of 13')}
              error={errored}
              wells={<StatWell value={m('all on')} caption="status" />}
            />

            <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
              <SettingsGroup title="All booking events" state="ready">
                {BOOKING_EVENTS.map(e => (
                  <SettingsRow
                    key={e.label}
                    kind="value"
                    label={e.label}
                    /* A COUNT, not a toggle — the row leads to the channel
                       picker rather than switching the event off. */
                    value={errored ? '—' : `${e.channels} ${e.channels === 1 ? 'channel' : 'channels'}`}
                    onClick={() => undefined}
                  />
                ))}
              </SettingsGroup>

              <SettingsGroup
                title="Daily briefs"
                description="Automatic morning and end-of-day summaries."
                state="ready"
              >
                <SettingsRow
                  kind="toggle"
                  label="Morning brief · 8:00 AM"
                  description="Today's jobs, open estimates, and anything unassigned."
                  checked={morning}
                  onCheckedChange={setMorning}
                />
                <SettingsRow
                  kind="toggle"
                  label="End-of-day brief · 6:00 PM"
                  description="What completed, what slipped, and tomorrow's first job."
                  checked={evening}
                  onCheckedChange={setEvening}
                />
              </SettingsGroup>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
