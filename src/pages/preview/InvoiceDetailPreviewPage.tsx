import { useState } from 'react';
import { Card, Eyebrow, StatusBadge, Button, DetailHeader } from '@/components/portal-v2';

/**
 * Screen 8b — Invoice details.
 *
 * Preview route only, static data. Additive.
 *
 * ── A table that survives 390px ───────────────────────────────────────
 *
 * Worth calling out, because every other table in this work had to become
 * a list. The comp keeps the line items as a real grid:
 *
 *     grid-template-columns: 1fr 40px 70px 70px      ITEM QTY PRICE AMOUNT
 *
 * That fits because only one column is elastic and the other three are
 * narrow and numeric. Inside a card at 390px the item column still gets
 * ~134px. The rule was never "no tables at this width" — it was that a
 * nine-column table cannot survive one. Four narrow columns can, and
 * turning this into stacked rows would be worse: a line item IS a row of
 * four aligned numbers, and reading down the AMOUNT column is the point.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   card       radius 16, padding 16/18
 *   table head 10.5px/800, .04em tracking, muted, 8px above a hairline
 *   row        12.5px, 11px vertical padding, hairline beneath
 *   qty/price  muted; amount 800 in full ink
 *   subtotal   12.5px, 11px above; total 14px/800, 8px above
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * "Amount due $0.00" with a PAID badge is the comp's own ready state, and
 * that zero is TRUE — it is the whole point of the screen. So this is a
 * case where money legitimately renders zero, and the failed read has to
 * look different: figures render "—" and the total line says it could not
 * load. A $0.00 that means "paid" and a $0.00 that means "we could not
 * read it" would otherwise be the same pixels.
 */

type Phase = 'paid' | 'due' | 'error';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'paid', label: 'Paid', why: 'Amount due $0.00 — a TRUE zero, and the point of the screen.' },
  { id: 'due', label: 'Unpaid', why: 'The same invoice before payment: $300.00 due, no payment line.' },
  { id: 'error', label: 'Error', why: 'Figures render "—". A $0.00 meaning "paid" and one meaning "unreadable" must not be the same pixels.' },
];

const ITEMS = [{ item: 'Move In/Out Clean', qty: '1', price: '$300.00', amount: '$300.00' }];

export default function InvoiceDetailPreviewPage() {
  const [phase, setPhase] = useState<Phase>('paid');
  const errored = phase === 'error';
  const paid = phase === 'paid';
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
        <DetailHeader title="INV-0073" onBack={() => undefined} />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-1">
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth className="rounded-[10px]">Share</Button>
            <Button variant="secondary" fullWidth className="rounded-[10px]">Print</Button>
          </div>

          <Card>
            <Eyebrow>Amount due</Eyebrow>
            <div className="mt-1 flex items-center gap-2.5">
              <p className="text-[28px] font-extrabold tabular-nums leading-none text-[hsl(var(--pv-ink))]">
                {errored ? '—' : paid ? '$0.00' : '$300.00'}
              </p>
              {!errored && (
                <StatusBadge tone={paid ? 'success' : 'danger'} label={paid ? 'Paid' : 'Unpaid'} />
              )}
            </div>
            {errored && (
              <p role="alert" className="mt-2 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load this invoice. Nothing has been charged or changed.
              </p>
            )}
          </Card>

          <Card>
            <p className="text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">TidyWise</p>
            <p className="mt-0.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              support@tidywisecleaning.com · 813-735-6859
            </p>
            <p className="text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              65 Southwest 12th Avenue, Deerfield Beach, FL 33442
            </p>

            <div className="mt-3 border-t border-[hsl(var(--pv-border))] pt-3">
              <Row label="Invoice number" value="INV-0073" />
              <Row label="Invoice date" value="Aug 17, 2026" />
              <Row label="Due date" value="Aug 24, 2026" />
            </div>
          </Card>

          <Card>
            <Eyebrow>Bill to</Eyebrow>
            <p className="mt-1.5 text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
              Shafali Mphahlele
            </p>
            <p className="mt-0.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              mphoment20@gmail.com · 448-968-9567
            </p>
            <p className="text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              8500 Cleary Boulevard, Plantation, FL 33324
            </p>
          </Card>

          <Card>
            {/* The comp's own grid: 1fr 40px 70px 70px. Kept as a table
                because a line item IS four aligned numbers. */}
            <div className="grid grid-cols-[1fr_40px_70px_70px] border-b border-[hsl(var(--pv-border))] pb-2 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[hsl(var(--pv-ink-3))]">
              <span>Item</span>
              <span>Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Amount</span>
            </div>
            {ITEMS.map(it => (
              <div
                key={it.item}
                className="grid grid-cols-[1fr_40px_70px_70px] border-b border-[hsl(var(--pv-border))] py-[11px] text-[12.5px]"
              >
                <span className="pr-2 font-bold text-[hsl(var(--pv-ink))]">{it.item}</span>
                <span className="text-[hsl(var(--pv-ink-3))]">{m(it.qty)}</span>
                <span className="text-right text-[hsl(var(--pv-ink-3))]">{m(it.price)}</span>
                <span className="text-right font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                  {m(it.amount)}
                </span>
              </div>
            ))}

            <div className="flex pt-[11px] text-[12.5px]">
              <span className="flex-1 text-[hsl(var(--pv-ink-3))]">Subtotal</span>
              <span className="font-bold tabular-nums text-[hsl(var(--pv-ink))]">{m('$300.00')}</span>
            </div>
            <div className="flex pt-2 text-[14px]">
              <span className="flex-1 font-extrabold text-[hsl(var(--pv-ink))]">Total</span>
              <span className="font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">{m('$300.00')}</span>
            </div>
          </Card>

          {paid && (
            <Card>
              <div className="flex text-[12.5px]">
                <span className="flex-1 text-[hsl(var(--pv-ink-3))]">
                  Payment on Aug 20, 2026 · Credit / Debit Card
                </span>
                <span className="font-bold tabular-nums text-[hsl(var(--pv-success))]">$300.00</span>
              </div>
              <div className="mt-2 flex text-[12.5px]">
                <span className="flex-1 font-bold text-[hsl(var(--pv-ink))]">Remaining balance</span>
                <span className="font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">$0.00</span>
              </div>
            </Card>
          )}

          <p className="px-1 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
            Questions? Reply to this email or contact support@tidywisecleaning.com
          </p>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[28px] items-center text-[12.5px]">
      <span className="flex-1 text-[hsl(var(--pv-ink-3))]">{label}</span>
      <span className="font-bold tabular-nums text-[hsl(var(--pv-ink))]">{value}</span>
    </div>
  );
}
