import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { useMemo, useState } from 'react';
import { Card, CardTitle, StatCard, Sparkline, SegmentedTabs, ActionChipRow } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';

/**
 * /dashboard/reports-v2 — the reports overview on real data. ADDITIVE.
 *
 * ── "Net volume from sales" is gross × 0.97, and that is not a measurement ─
 *
 * ReportsOverview.tsx:217:
 *
 *     const netVolume = Math.round(grossVolume * 0.97 * 100) / 100; // ~3% Stripe fees
 *
 * A hardcoded 3% applied to every booking, presented in the same row of cards
 * as figures that were actually counted. Stripe's real fee is neither 3% nor
 * flat, and — more to the point — no fee at all is charged on money that was
 * never processed.
 *
 * Which is most of it here. Measured on the live org:
 *
 *     completed bookings   2   worth $282
 *     paid bookings        1   worth $2
 *
 * gross comes from `status === 'completed'` (:96-103), so it counts $282.
 * netVolume would therefore report $273.54, having deducted a card-processing
 * fee from $280 that never touched a card. Meanwhile "Successful payments" on
 * the same screen correctly filters payment_status === 'paid' and returns 1.
 *
 * So two metrics side by side disagree about what happened, and the one that
 * looks most like money is the invented one.
 *
 * This screen does not estimate a fee. It reports completed work and collected
 * money as two separate figures, both counted, and says which is which. If a
 * processor fee is wanted it has to come from the processor — Finance already
 * branches on stripeConnected for exactly that.
 */

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * `actions` is the live ReportsPage's date-range control. Reports with no
 * stated period are the same trap as payroll — a number is meaningless
 * until you know the window. Optional, so /dashboard/reports-v2 is
 * unchanged.
 */
export function ReportsMobileBody({
  actions,
}: {
  actions?: ActionChip[];
} = {}) {
  const { organization } = useOrganization();
  /* Booked by default — it is the series that actually has shape, and an
     operator plans against work scheduled. Labelled and switchable, because
     the defect on the live screen was never "booked revenue", it was booked
     revenue presented as though it were collected. */
  const [basis, setBasis] = useState<'booked' | 'collected'>('booked');
  const orgTz = useOrgTimezone();

  const q = useQuery({
    queryKey: ['reports-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, status, payment_status, total_amount, scheduled_at, customer_id, created_at')
        .eq('organization_id', organization.id)
        .order('scheduled_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const customersQ = useQuery({
    queryKey: ['reports-v2-customers', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('id, created_at')
        .eq('organization_id', organization.id)
        .is('merged_into', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const phase = queryPhase(q);
  const customersPhase = queryPhase(customersQ);

  const m = useMemo(() => {
    const rows = (q.data ?? []) as any[];
    const completed = rows.filter(b => b.status === 'completed');
    const paid = rows.filter(b => b.payment_status === 'paid' || b.payment_status === 'partial');

    const completedGross = completed.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);
    const collected = paid.reduce((s, b) => s + Number(b.total_amount ?? 0), 0);

    /* Spend per customer on COLLECTED money over customers who actually paid.
       Dividing booked money by every customer produces a figure that is not
       about spending at all. */
    const payingCustomers = new Set(paid.map(b => b.customer_id).filter(Boolean));
    const spendPerPayer = payingCustomers.size > 0 ? collected / payingCustomers.size : null;

    /* Two monthly series. Which one the chart draws is the caller's choice
       and is always named on screen. */
    const monthly = (src: any[]) => {
      const byMonth = new Map<string, number>();
      for (const b of src) {
        const k = String(b.scheduled_at).slice(0, 7);
        byMonth.set(k, (byMonth.get(k) ?? 0) + Number(b.total_amount ?? 0));
      }
      return [...byMonth.entries()].sort(([a], [b2]) => a.localeCompare(b2)).map(([, v]) => v);
    };
    const seriesBooked = monthly(rows.filter(b => b.status !== 'cancelled'));
    const seriesCollected = monthly(paid);

    return {
      total: rows.length,
      completedCount: completed.length,
      paidCount: paid.length,
      completedGross,
      collected,
      spendPerPayer,
      payingCustomers: payingCustomers.size,
      seriesBooked,
      seriesCollected,
    };
  }, [q.data]);

  const series = basis === 'booked' ? m.seriesBooked : m.seriesCollected;

  const newCustomers = (customersQ.data ?? []).length;

  if (phase === 'error' || phase === 'offline') {
    return (
      <>
        <div className="portal-v2 mx-auto w-full max-w-[430px] px-5 py-4">
          <Card>
            <CardTitle>Couldn&rsquo;t load your reports</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              No figures are shown rather than shown wrong. Every number here is
              money or counted from it.
            </p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
        {actions && actions.length > 0 && (
          <ActionChipRow actions={actions} label="Report period" />
        )}

        {phase === 'loading' ? (
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">Loading…</p>
        ) : (
          <>
            {/* Completed work and collected money, both counted, side by side.
                Neither is derived from the other. */}
            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                label="Collected"
                value={money(m.collected)}
                caption={`${m.paidCount} paid booking${m.paidCount === 1 ? '' : 's'}`}
              />
              <StatCard
                label="Completed work"
                value={money(m.completedGross)}
                caption={`${m.completedCount} job${m.completedCount === 1 ? '' : 's'} finished`}
              />
            </div>

            {m.completedGross > m.collected && (
              <p className="rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
                {money(m.completedGross - m.collected)} of completed work has not
                been paid for. Those are two different numbers and neither is an
                estimate of the other.
              </p>
            )}

            <Card>
              <CardTitle>
                {basis === 'booked' ? 'Booked over time' : 'Collected over time'}
              </CardTitle>
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
                  ? 'Work booked each month, whether or not it has been paid for.'
                  : 'Money actually taken, by month.'}
              </p>
              <div className="mt-2.5">
                {/* null, not zeroes — a flat line along the bottom of a revenue
                    chart reads as a collapse, not as an absent read. */}
                <Sparkline
                  points={series.length >= 2 ? series : null}
                  height={56}
                  label={`${basis === 'booked' ? 'Booked' : 'Collected'} revenue by month`}
                  caption={
                    series.length === 0
                      ? basis === 'booked' ? 'Nothing booked yet' : 'Nothing collected yet'
                      : `Only one month of ${basis === 'booked' ? 'bookings' : 'payments'} — no trend to draw`
                  }
                />
              </div>
            </Card>

            <Card>
              <CardTitle>Customers</CardTitle>
              <div className="mt-2">
                {[
                  [
                    'Customers on file',
                    customersPhase === 'ready' ? String(newCustomers) : '—',
                  ],
                  ['Customers who have paid', String(m.payingCustomers)],
                  [
                    'Spend per paying customer',
                    /* A ratio over a set that can be empty. Suppressed rather
                       than shown as $0.00, which would read as customers who
                       spend nothing. */
                    m.spendPerPayer === null ? '—' : money(m.spendPerPayer),
                  ],
                ].map(([label, v]) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                      {label}
                    </span>
                    <span className="shrink-0 tabular-nums text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              {customersPhase !== 'ready' && (
                <p className="mt-2 text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]">
                  The customer count didn&rsquo;t load. The payment figures above
                  are unaffected.
                </p>
              )}
            </Card>

            {/* Deliberately absent: a "net volume" card. See the file header —
                the live one multiplies gross by 0.97 and calls the result a
                measurement. */}
            <p className="px-1 text-[11px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
              No processing-fee estimate is shown. Fees come from the payment
              processor, and no fee is charged on money that was never
              processed — connect Stripe in Finance for real figures.
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


export default function ReportsWiredPage() {
  return (
    <AdminLayout title="Reports" subtitle="Mobile layout, live data">
      <ReportsMobileBody />
    </AdminLayout>
  );
}
