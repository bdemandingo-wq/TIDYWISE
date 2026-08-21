import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { Card, CardTitle, StatCard } from '@/components/portal-v2';

/**
 * /dashboard/finance-v2 — the P&L on real data. ADDITIVE.
 *
 * ── Booked is not collected, and the live screen conflates them ───────────
 *
 * FinancePage computes totalSales from every non-cancelled booking in range,
 * paid or not (:290), then netProfit = netRevenue - cleanerPay - expenses -
 * refunds (:326). Total Sales carries the caveat "gross, incl. unpaid" and is
 * honest about it. Net Profit inherits the same basis and carries NO caveat.
 *
 * Observed live this month: Total Sales $460.00 across 2 bookings, both
 * `pending`. Cleaner Pay -$0.00. Net Profit $460.00. Nothing has been
 * collected and nobody has been paid, and the screen reports $460 of profit.
 *
 * paidTransactions is already computed at :287 — filtering payment_status to
 * paid/partial — and then never used. So the collected figure exists and is
 * discarded.
 *
 * This screen separates them. Booked and collected are two numbers, profit is
 * labelled by which basis it rests on, and a profit that includes uncollected
 * money never renders as though it were realised.
 *
 * ── Stripe is the payer, so Stripe wins where it is connected ─────────────
 *
 * The live screen already does this well — it branches on stripeConnected and
 * marks the source with a tick or a warning (:557, :580). That discipline is
 * kept: when Stripe is connected its figures are authoritative, and when it is
 * not the screen says the numbers are derived from bookings rather than from
 * the processor.
 *
 * ── Expenses ──────────────────────────────────────────────────────────────
 *
 * 0 rows on this org. That is a real zero — nothing has been logged — and it
 * is different from an expenses read that failed. Said explicitly, the same
 * distinction the P&L preview makes.
 */

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinanceWiredPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const [range] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start: start.toISOString(), end: end.toISOString() };
  });

  const bookingsQ = useQuery({
    queryKey: ['finance-v2-bookings', organizationId, range.start],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, total_amount, payment_status, status, scheduled_at, cleaner_pay_expected, cleaner_actual_payment')
        .eq('organization_id', organizationId)
        .gte('scheduled_at', range.start)
        .lte('scheduled_at', range.end)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  const expensesQ = useQuery({
    queryKey: ['finance-v2-expenses', organizationId, range.start],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, category')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  const m = useMemo(() => {
    const rows = (bookingsQ.data ?? []) as any[];
    const isPaid = (b: any) => b.payment_status === 'paid' || b.payment_status === 'partial';

    const booked = rows.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const collected = rows.filter(isPaid).reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const refunded = rows
      .filter(b => b.payment_status === 'refunded')
      .reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    /* Only the snapshot fields. A computed estimate is not a cost you can put
       in a profit line — the payroll screen shows those separately and says
       they can still move. */
    const cleanerPayKnown = rows.reduce(
      (s, b) =>
        s +
        Number(b.cleaner_pay_expected ?? b.cleaner_actual_payment ?? 0),
      0,
    );
    const cleanerPayUnknownCount = rows.filter(
      b => b.cleaner_pay_expected == null && b.cleaner_actual_payment == null,
    ).length;

    return {
      count: rows.length,
      paidCount: rows.filter(isPaid).length,
      booked,
      collected,
      refunded,
      cleanerPayKnown,
      cleanerPayUnknownCount,
    };
  }, [bookingsQ.data]);

  const expensesTotal = useMemo(
    () => (expensesQ.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0),
    [expensesQ.data],
  );

  const phase = combinedPhase([bookingsQ, expensesQ]);
  const expensesPhase = queryPhase(expensesQ);

  /* Profit on what has actually been collected. This is the number that can be
     stated without a caveat, because every term in it has happened. */
  const realisedProfit = m.collected - m.refunded - m.cleanerPayKnown - expensesTotal;
  /* And the same sum on the booked basis, which is what the live screen shows
     as "Net Profit" with no qualification. */
  const projectedProfit = m.booked - m.refunded - m.cleanerPayKnown - expensesTotal;
  const uncollected = m.booked - m.collected;

  if (phase === 'error' || phase === 'offline') {
    return (
      <AdminLayout title="Finance" subtitle="Mobile layout, live data">
        <div className="portal-v2 mx-auto w-full max-w-[430px] px-5 py-4">
          <Card>
            <CardTitle>Couldn&rsquo;t load your finances</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              No figures are shown rather than shown wrong. Every number on this
              screen is money, and a partial read would understate costs and
              overstate profit.
            </p>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Finance" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
        {phase === 'loading' ? (
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
            Loading this month&rsquo;s figures…
          </p>
        ) : (
          <>
            {/* The two numbers the live screen merges into one. */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                label="Collected"
                value={money(m.collected)}
                caption={`${m.paidCount} of ${m.count} bookings paid`}
              />
              <StatCard
                label="Booked"
                value={money(m.booked)}
                caption={uncollected > 0 ? `${money(uncollected)} not yet paid` : 'all collected'}
              />
            </div>

            <Card>
              <CardTitle>Profit this month</CardTitle>
              <p className="mt-1 text-[26px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                {money(realisedProfit)}
              </p>
              <p className="mt-0.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
                On money actually collected.
              </p>

              {/* The live screen's Net Profit, shown as what it is: a
                  projection resting on money nobody has paid yet. */}
              {uncollected > 0 && (
                <p className="mt-2 rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
                  {money(projectedProfit)} if everything booked gets paid —
                  that includes {money(uncollected)} nobody has paid yet, so it
                  is a projection, not a result.
                </p>
              )}

              {/* Costs that are not yet knowable must not read as zero costs. */}
              {m.cleanerPayUnknownCount > 0 && (
                <p className="mt-2 text-[11.5px] font-bold leading-[1.45] text-[hsl(var(--pv-danger))]">
                  Cleaner pay is only locked in for{' '}
                  {m.count - m.cleanerPayUnknownCount} of {m.count} bookings.
                  The rest is not counted as a cost here, so both figures above
                  are higher than the truth.
                </p>
              )}
            </Card>

            <Card>
              <CardTitle>Where it goes</CardTitle>
              <div className="mt-2.5">
                {[
                  ['Collected', money(m.collected), false],
                  ['Refunds', `−${money(m.refunded)}`, m.refunded === 0],
                  ['Cleaner pay (locked in)', `−${money(m.cleanerPayKnown)}`, m.cleanerPayKnown === 0],
                  ['Expenses', `−${money(expensesTotal)}`, expensesTotal === 0],
                ].map(([label, val, isZero]) => (
                  <div
                    key={label as string}
                    className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                      {label as string}
                    </span>
                    <span className="shrink-0 tabular-nums text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                      {val as string}
                    </span>
                  </div>
                ))}
              </div>
              {/* A genuine nil is not a failed read, and this screen has both
                  kinds available to it. */}
              <p className="mt-2 text-[11px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
                {expensesPhase === 'ready' && expensesTotal === 0
                  ? 'No expenses have been logged this month — that is a real nil, not a figure we could not read.'
                  : 'Expenses as logged.'}
              </p>
            </Card>

            <p className="px-1 text-[11px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
              Figures are derived from bookings, not from your payment
              processor. Connect Stripe for the amounts it actually charged.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
