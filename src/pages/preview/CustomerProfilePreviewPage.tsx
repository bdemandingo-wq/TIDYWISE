import { useState } from 'react';
import {
  Card,
  Eyebrow,
  Avatar,
  StatusBadge,
  Button,
  SettingsRow,
  DetailHeader,
} from '@/components/portal-v2';

/**
 * Screen 7h — Customers, profile sheet.
 *
 * Preview route only, static data. Additive.
 *
 * The sheet that opens from a row on 7g. Five stacked sections: identity,
 * four quick actions, contact info, booking info, notes, linked items.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   card       radius 16, padding 16/18, 11px gaps
 *   section    label 11px/800, letter-spacing .05em, muted — typed in caps
 *   row        26px icon gutter, label and value on one line, chevron where
 *              the row leads somewhere
 *
 * ── A correction this screen forced ───────────────────────────────────
 *
 * I claimed earlier that "the comps contain zero uppercase or
 * letter-spacing". That generalised from a two-screen sample and is wrong.
 * Measured across all 76: `text-transform` appears ZERO times — nothing is
 * CSS-uppercased, labels are typed in caps — but `letter-spacing` appears
 * 240 times. Tracked caps are part of the language after all.
 *
 * The two changes that claim justified still stand on their own evidence:
 * 4c's stat label and 11c's alert title are genuinely sentence case in
 * their comps. But Eyebrow was right all along for section labels, and it
 * is used here. Its size and tracking now match 7h (11px, .05em) rather
 * than the values it was guessed at.
 *
 * ── The em-dash is the comp's own ─────────────────────────────────────
 *
 * "Next booking —" appears in the comp for a customer with nothing
 * scheduled. That is the same convention §5.1 arrived at independently: a
 * fact that has no value renders as a dash, never as a zero or a blank. It
 * is reassuring to find it already in the design rather than imposed on it.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Booking info is money and history. On a failed read every figure renders
 * "—" and the section says so, because "Total spent $0.00" about a customer
 * who has spent $4,000 is worse than showing nothing.
 */

type Phase = 'ready' | 'no-history' | 'error';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'One booking, no next booking — the comp\'s own em-dash for a fact with no value.' },
  { id: 'no-history', label: 'New customer', why: 'Added but never booked. Zero bookings is TRUE here, so it shows 0 — not a dash.' },
  { id: 'error', label: 'Error', why: 'Figures render "—". "Total spent $0.00" about someone who spent $4,000 is worse than nothing.' },
];

export default function CustomerProfilePreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const errored = phase === 'error';
  const fresh = phase === 'no-history';

  /* A real zero and an unreadable figure are different things, and this
     screen shows both: a new customer genuinely has 0 bookings. */
  const bookings = errored ? '—' : fresh ? '0' : '1';
  const lastBooking = errored ? '—' : fresh ? '—' : 'Dec 31, 2025';
  const nextBooking = '—';
  const totalSpent = errored ? '—' : fresh ? '$0.00' : '$100.00';

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
        <DetailHeader title="Customer" onBack={() => undefined} />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-1">
          <Card>
            <div className="flex items-center gap-3">
              <Avatar name="Adriana Xionita" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold text-[hsl(var(--pv-ink))]">
                  Adriana Xionita
                </span>
                <span className="mt-1 block">
                  <StatusBadge tone={fresh ? 'warn' : 'success'} label={fresh ? 'Lead' : 'Active Client'} />
                </span>
              </span>
            </div>

            {/* Four quick actions, equal width, as the comp lays them out. */}
            <div className="mt-3.5 grid grid-cols-4 gap-2">
              <Button variant="secondary" className="rounded-[10px]">Call</Button>
              <Button variant="secondary" className="rounded-[10px]">Text</Button>
              <Button variant="secondary" className="rounded-[10px]">Mail</Button>
              <Button variant="primary" className="rounded-[10px]">Book</Button>
            </div>
          </Card>

          <Card>
            <Eyebrow>Contact info</Eyebrow>
            <div className="mt-1">
              <SettingsRow kind="value" label="Mobile" value="561-451-5430" onClick={() => undefined} />
              <SettingsRow kind="value" label="Email" value="Xionita@yahoo.com" onClick={() => undefined} />
            </div>
          </Card>

          <Card>
            <Eyebrow>Booking info</Eyebrow>
            {errored && (
              <p role="alert" className="mt-1 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load this customer&rsquo;s history.
              </p>
            )}
            <div className="mt-1">
              <SettingsRow kind="value" label="Total bookings" value={bookings} />
              <SettingsRow kind="value" label="Last booking" value={lastBooking} />
              {/* The comp's own em-dash: nothing scheduled is a dash, not a blank. */}
              <SettingsRow kind="value" label="Next booking" value={nextBooking} />
              <SettingsRow kind="value" label="Total spent" value={totalSpent} />
            </div>
          </Card>

          <Card>
            <Eyebrow>Notes</Eyebrow>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              {fresh ? 'No notes yet.' : 'One time'}
            </p>
          </Card>

          <Card>
            <Eyebrow>Linked items</Eyebrow>
            <div className="mt-1">
              <SettingsRow kind="value" label="View bookings" value="" onClick={() => undefined} />
              <SettingsRow kind="value" label="View invoices" value="" onClick={() => undefined} />
              <SettingsRow kind="value" label="View payment history" value="" onClick={() => undefined} />
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
