import { useState } from 'react';
import {
  Card,
  CardTitle,
  SegmentedTabs,
  SettingsRow,
  Button,
  DetailHeader,
} from '@/components/portal-v2';

/**
 * Screen 8c — New invoice.
 *
 * Preview route only, static data. Additive.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   card         radius 16, padding 16/18; the payment card uses 9px gaps
 *   card title   14px/800
 *   note field   min-height 44px, counter 10px muted right-aligned 3px below
 *   add zone     1.5px DASHED border in brand-soft, radius 10, padding 12,
 *                centred, 12.5px/700 in brand
 *   inline links 12px/700 in brand, 14px apart
 *   payment row  12px; label 700 full ink, value muted; "Free" in green
 *
 * ── The dashed add zone is doing real work ────────────────────────────
 *
 * An invoice with no line items is not an error and not an empty state to
 * apologise for — it is step one of every invoice ever written. The comp
 * makes the absence itself the control: a dashed outline you tap. That is
 * why it is not a plain button, and why it is the widest thing on the
 * card.
 *
 * ── An invoice can be addressed to a lead ─────────────────────────────
 *
 * The Customer / Lead switch at the top is the same fact 8a encodes with
 * its "Lead" badge, and the same one getInvoiceParty() resolves in code
 * (`customer ?? lead ?? null`). Three places agree, so it is real: you
 * invoice people who are not customers yet. That is how a quote becomes
 * money.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * "Total due $0.00" is the comp's own starting state and it is TRUE — a
 * new invoice with no items owes nothing yet. So zero is correct here, and
 * the screen must not confuse it with a failure. Send stays disabled while
 * the total is zero, which is the honest reading: there is nothing to send
 * yet, and the button says so rather than failing after the tap.
 */

type Phase = 'empty' | 'one-item';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'empty', label: 'New', why: 'Total due $0.00 — TRUE for an invoice with no items. Send is disabled because there is nothing to send.' },
  { id: 'one-item', label: 'One item', why: 'A line item added; the total is real and Send becomes available.' },
];

export default function NewInvoicePreviewPage() {
  const [phase, setPhase] = useState<Phase>('empty');
  const [party, setParty] = useState<'customer' | 'lead'>('customer');
  const [recurring, setRecurring] = useState(false);
  const [note, setNote] = useState('');

  const hasItems = phase === 'one-item';
  const total = hasItems ? '$300.00' : '$0.00';

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
        <DetailHeader title="New Invoice" onBack={() => undefined} />

        <div className="flex flex-col gap-3 px-5 pb-28 pt-1">
          <Card>
            <CardTitle>Total due</CardTitle>
            <p className="mt-1 text-[28px] font-extrabold tabular-nums leading-none text-[hsl(var(--pv-ink))]">
              {total}
            </p>
          </Card>

          <Card>
            <CardTitle>Customer details</CardTitle>
            <div className="mt-2.5">
              {/* Customer vs Lead — the same fact 8a badges and
                  getInvoiceParty() resolves in code. */}
              <SegmentedTabs<'customer' | 'lead'>
                tabs={[
                  { id: 'customer', label: 'Customer' },
                  { id: 'lead', label: 'Lead' },
                ]}
                value={party}
                onChange={setParty}
                label="Invoice recipient type"
              />
            </div>
            <label className="mt-2.5 flex h-11 items-center gap-2 rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3">
              <input
                placeholder={party === 'customer' ? 'Search customers…' : 'Search leads…'}
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none"
              />
            </label>
          </Card>

          <Card>
            <CardTitle>Invoice details</CardTitle>
            <div className="mt-1">
              <SettingsRow kind="value" label="Invoice number" value="Auto-generated" />
              <SettingsRow
                kind="toggle"
                label="Make this recurring"
                checked={recurring}
                onCheckedChange={setRecurring}
              />
              <SettingsRow kind="value" label="Send" value="Immediately" onClick={() => undefined} />
              <SettingsRow kind="value" label="Due" value="In 7 days" onClick={() => undefined} />
            </div>
          </Card>

          <Card>
            <CardTitle>Note</CardTitle>
            <textarea
              value={note}
              maxLength={250}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a quick note for your client (optional)"
              className="mt-2 min-h-[44px] w-full resize-none rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 py-2.5 text-[12.5px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
            />
            <p className="mt-[3px] text-right text-[10px] font-medium text-[hsl(var(--pv-ink-3))]">
              {note.length}/250
            </p>
          </Card>

          <Card>
            <CardTitle>Billable items</CardTitle>

            {hasItems && (
              <div className="mt-2.5 flex items-center rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3 text-[12.5px]">
                <span className="flex-1 font-bold text-[hsl(var(--pv-ink))]">Move In/Out Clean</span>
                <span className="font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">$300.00</span>
              </div>
            )}

            {/* Absence as the control: a dashed outline you tap, not a
                button beside an apology. An invoice with no items is step
                one, not an empty state. */}
            <button
              type="button"
              onClick={() => setPhase('one-item')}
              className="mt-2.5 w-full rounded-[10px] border-[1.5px] border-dashed border-[hsl(var(--pv-brand-soft))] p-3 text-center text-[12.5px] font-bold text-[hsl(var(--pv-brand))]"
            >
              + Add item
            </button>

            <div className="mt-2.5 flex gap-3.5 text-[12px] font-bold text-[hsl(var(--pv-brand))]">
              <button type="button">Add a discount</button>
              <button type="button">Add tax</button>
            </div>
          </Card>

          <Card>
            <CardTitle>Payment options</CardTitle>
            <div className="mt-2 flex flex-col gap-[9px] text-[12px]">
              <div className="flex">
                <span className="flex-1 font-bold text-[hsl(var(--pv-ink))]">Debit/Credit Cards</span>
                <span className="text-[hsl(var(--pv-ink-3))]">2.9% + $0.30</span>
              </div>
              <div className="flex">
                <span className="flex-1 font-bold text-[hsl(var(--pv-ink))]">Bank Transfer (ACH)</span>
                <span className="font-bold text-[hsl(var(--pv-success))]">Free</span>
              </div>
              <div className="flex">
                <span className="flex-1 font-bold text-[hsl(var(--pv-ink))]">Reminders</span>
                <span className="text-[hsl(var(--pv-ink-3))]">2 &amp; 7 days after due</span>
              </div>
            </div>
          </Card>
        </div>

        {/* A bare action bar, as the comp has it. I first used
            StickyFooterBar to carry the running total beside the buttons —
            it seemed better placed there — but at 390px its eyebrow clipped
            to "TO... DU..." next to two full-width buttons, and the comp puts
            the total in a card at the top for exactly that reason. */}
        <div className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] gap-2 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          <Button variant="secondary" fullWidth className="rounded-[10px]">
            Preview
          </Button>
          {/* Nothing to send while the total is zero. Disabled says so before
              the tap rather than failing after it. */}
          <Button
            variant={hasItems ? 'primary' : 'disabled-visible'}
            fullWidth
            className="rounded-[10px]"
          >
            Send
          </Button>
        </div>
      </main>
    </div>
  );
}
