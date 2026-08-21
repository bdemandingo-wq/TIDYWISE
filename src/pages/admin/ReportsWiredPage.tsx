import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { Card, CardTitle, StatCard, Sparkline } from '@/components/portal-v2';

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

export default function ReportsWiredPage() {
  const { organization } = useOrganization();
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

    /* Monthly series of collected money, for the one chart this screen has. */
    const byMonth = new Map<string, number>();
    for (const b of paid) {
      const k = String(b.scheduled_at).slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(b.total_amount ?? 0));
    }
    const series = [...byMonth.entries()].sort(([a], [b2]) => a.localeCompare(b2)).map(([, v]) => v);

    return {
      total: rows.length,
      completedCount: completed.length,
      paidCount: paid.length,
      completedGross,
      collected,
      spendPerPayer,
      payingCustomers: payingCustomers.size,
      series,
    };
  }, [q.data]);

  const newCustomers = (customersQ.data ?? []).length;

  if (phase === 'error' || phase === 'offline') {
    return (
      <AdminLayout title="Reports" subtitle="Mobile layout, live data">
        <div className="portal-v2 mx-auto w-full max-w-[430px] px-5 py-4">
          <Card>
            <CardTitle>Couldn&rsquo;t load your reports</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              No figures are shown rather than shown wrong. Every number here is
              money or counted from it.
            </p>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Reports" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
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
              <CardTitle>Collected over time</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-[hsl(var(--pv-ink-3))]">
                Money actually taken, by month.
              </p>
              <div className="mt-2.5">
                {/* null, not zeroes — a flat line along the bottom of a revenue
                    chart reads as a collapse, not as an absent read. */}
                <Sparkline
                  points={m.series.length >= 2 ? m.series : null}
                  height={56}
                  label="Collected revenue by month"
                  caption={
                    m.series.length === 0
                      ? 'Nothing collected yet'
                      : 'Only one month of payments — no trend to draw'
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
    </AdminLayout>
  );
}
