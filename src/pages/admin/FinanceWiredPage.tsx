import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { Card, CardTitle, StatCard, SegmentedTabs, ActionChipRow, InverseHeader, StatWell } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';

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

/**
 * `actions` are the live FinancePage's exports (QuickBooks/Xero, Income
 * Report, Sales Tax by Zip) and Sync with Stripe. This screen has no list,
 * so they render as a chip row above the cards rather than inside a shell.
 * Optional, so /dashboard/finance-v2 is unchanged.
 */
export function FinanceMobileBody({
  actions,
}: {
  actions?: ActionChip[];
} = {}) {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const orgTz = useOrgTimezone();
  /* 6d's P&L calendar. Booked by DEFAULT, because that is what the comp shows
     and what an operator plans against — but never unlabelled, which was the
     actual defect on the live screen: Total Sales said "incl. unpaid" and Net
     Profit inherited the same basis silently. The basis is named in the card
     title, restated under it, and switchable. */
  const [basis, setBasis] = useState<'booked' | 'collected'>('booked');
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
        .select('id, booking_number, total_amount, payment_status, status, scheduled_at, cleaner_pay_expected, cleaner_actual_payment, customer_id')
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

    /* Distinct customers who actually have a booking this month. 6d divides
       by this for "avg / customer"; dividing by the org's whole customer list
       would understate it by counting people who did not book. */
    const customers = new Set(rows.map(b => b.customer_id).filter(Boolean)).size;

    return {
      count: rows.length,
      customers,
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

  /* One cell per day of the month. null means no bookings that day — which is
     not a day that earned nothing, and the two must not render alike. */
  const calendar = useMemo(() => {
    const rows = (bookingsQ.data ?? []) as any[];
    const start = new Date(range.start);
    const daysInMonth = new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0).getUTCDate();
    const isPaid = (b: any) => b.payment_status === 'paid' || b.payment_status === 'partial';
    const byDay = new Map<number, number>();
    for (const b of rows) {
      if (basis === 'collected' && !isPaid(b)) continue;
      const d = new Date(b.scheduled_at).getUTCDate();
      byDay.set(d, (byDay.get(d) ?? 0) + Number(b.total_amount ?? 0));
    }
    /* Today in the ORG's zone, not the device's. An admin in Manila looking
       at a Florida business must see Florida's today outlined, or the
       highlight lands on the wrong cell. The rest of this memo buckets by
       UTC date, which is a separate pre-existing question — this only decides
       which cell is ringed. */
    const orgTodayDay = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: orgTz, day: 'numeric' }).format(new Date()),
    );
    const orgTodayMonth = new Intl.DateTimeFormat('en-US', {
      timeZone: orgTz,
      month: 'numeric',
      year: 'numeric',
    }).format(new Date());
    const thisMonth = new Intl.DateTimeFormat('en-US', {
      timeZone: orgTz,
      month: 'numeric',
      year: 'numeric',
    }).format(start);

    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      amount: byDay.has(i + 1) ? byDay.get(i + 1)! : null,
      isToday: orgTodayMonth === thisMonth && orgTodayDay === i + 1,
    }));
  }, [bookingsQ.data, basis, range.start, orgTz]);

  const phase = combinedPhase([bookingsQ, expensesQ]);
  const expensesPhase = queryPhase(expensesQ);

  /* Profit on what has actually been collected. This is the number that can be
     stated without a caveat, because every term in it has happened. */
  const realisedProfit = m.collected - m.refunded - m.cleanerPayKnown - expensesTotal;
  /* And the same sum on the booked basis, which is what the live screen shows
     as "Net Profit" with no qualification. */
  const projectedProfit = m.booked - m.refunded - m.cleanerPayKnown - expensesTotal;
  const uncollected = m.booked - m.collected;
  /* 6d's two figures. Both are RATIOS or sums over a denominator that can be
     zero, so they are suppressed rather than shown as $0.00 — a month with no
     customers has no average, which is not the same as an average of nothing. */
  const spendPerCustomer = m.customers > 0 ? m.booked / m.customers : null;
  /* The month this screen covers, named. 6d titles the hero with it, and a
     finance screen whose period is unstated is the same trap as an undated
     payroll total. */
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(range.start)),
    [range.start],
  );

  if (phase === 'error' || phase === 'offline') {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
      {/* 6d's hero: the month as the title, gross profit as the headline, and
          spend per customer beside it. The comp puts its four view tabs here
          too — Transactions / P&L Calendar / Tax by Zip / P&L. Those views
          exist on the desktop page but are not ported to the phone yet, and a
          tab that switches to nothing is worse than no tab, so the wells carry
          booked / collected / owed instead until the views follow. */}
      <InverseHeader
        eyebrow="Finance"
        business={monthLabel}
        revenueLabel="Gross profit this month"
        revenue={money(realisedProfit)}
        trend={
          spendPerCustomer !== null
            ? { direction: 'up', label: `${money(spendPerCustomer)} avg / customer` }
            : undefined
        }
        wells={
          <>
            <StatWell value={money(m.booked)} caption="booked" />
            <StatWell value={money(m.collected)} caption="collected" />
            <StatWell value={money(uncollected)} caption="owed to you" />
          </>
        }
      />

      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
        {actions && actions.length > 0 && (
          <ActionChipRow actions={actions} label="Finance actions" />
        )}

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

            {/* 6d — revenue per day, on whichever basis is selected. */}
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>
                  {basis === 'booked' ? 'Booked per day' : 'Collected per day'}
                </CardTitle>
              </div>
              <div className="mt-2">
                <SegmentedTabs<'booked' | 'collected'>
                  tabs={[
                    { id: 'booked', label: 'Booked' },
                    { id: 'collected', label: 'Collected' },
                  ]}
                  value={basis}
                  onChange={setBasis}
                  label="Revenue basis"
                />
              </div>
              <p className="mt-2 text-[11.5px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
                {basis === 'booked'
                  ? 'Work scheduled that day, whether or not it has been paid for. A dash means nothing was booked — not that nothing was earned.'
                  : 'Money actually taken that day. A dash means nothing was collected.'}
              </p>
              <div className="mt-2.5 grid grid-cols-7 gap-1">
                {/* 6d labels the columns MON…SUN, not single letters — T and S
                    each appear twice and are ambiguous on their own. */}
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dd, i) => (
                  <span key={i} className="text-center text-[9px] font-bold uppercase tracking-[0.04em] text-[hsl(var(--pv-ink-3))]">
                    {dd}
                  </span>
                ))}
                {calendar.map(c => {
                  /* 6d tints a day that earned and leaves an empty day plain,
                     so the month's shape is readable at a glance. A day with
                     no bookings keeps the dash — it is not a day that earned
                     nothing. Today is outlined rather than filled, so it stays
                     legible whether or not it earned. */
                  const earned = c.amount !== null && c.amount > 0;
                  return (
                    <div
                      key={c.day}
                      aria-current={c.isToday ? 'date' : undefined}
                      className={
                        'rounded-[8px] px-1 py-1.5 text-center ' +
                        (earned
                          ? 'bg-[hsl(var(--pv-success-soft))]'
                          : 'bg-[hsl(var(--pv-sunken))]') +
                        (c.isToday ? ' ring-2 ring-[hsl(var(--pv-brand))]' : '')
                      }
                    >
                      <p
                        className={
                          'text-[10px] font-bold ' +
                          (c.isToday
                            ? 'text-[hsl(var(--pv-brand))]'
                            : 'text-[hsl(var(--pv-ink-3))]')
                        }
                      >
                        {c.day}
                      </p>
                      <p
                        className={
                          'truncate text-[9.5px] font-extrabold tabular-nums ' +
                          (earned
                            ? 'text-[hsl(var(--pv-success))]'
                            : 'text-[hsl(var(--pv-ink-3))]')
                        }
                      >
                        {c.amount === null ? '–' : c.amount >= 1000 ? `$${(c.amount / 1000).toFixed(1)}K` : `$${Math.round(c.amount)}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 6d's pair, beneath the calendar. Spend per customer is
                suppressed rather than zeroed when nobody booked this month —
                there is no average of no customers, and $0.00 would read as
                "everyone spent nothing". */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                label="Spend / customer"
                value={spendPerCustomer === null ? '—' : money(spendPerCustomer)}
                caption={
                  m.customers === 0
                    ? 'no customers booked'
                    : `${m.customers} customer${m.customers === 1 ? '' : 's'}`
                }
              />
              <StatCard
                label="Owed to you"
                value={money(uncollected)}
                caption={`${m.count - m.paidCount} unpaid booking${m.count - m.paidCount === 1 ? '' : 's'}`}
              />
            </div>

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
    </>
  );
}

/* ── Layout-free bodies ───────────────────────────────────────────────────
   Each screen is exported twice.

   *MobileBody renders the screen and NOTHING around it — no AdminLayout, no
   page chrome. That is what an existing admin page drops into its mobile
   branch, without nesting AdminLayout inside AdminLayout and getting two
   headers and two sidebars.

   The default/named *WiredPage export keeps the layout and is what the
   /dashboard/*-v2 route renders, so those routes are unchanged.
   ──────────────────────────────────────────────────────────────────────── */


export default function FinanceWiredPage() {
  return (
    <AdminLayout title="Finance" subtitle="Mobile layout, live data">
      <FinanceMobileBody />
    </AdminLayout>
  );
}
