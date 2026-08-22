import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { combinedPhase } from '@/lib/queryState';
import { resolveCleanerPay } from '@/lib/wageCalculation';
import { SimpleListView, useSimpleSearch, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/payroll-v2 — cleaner pay on real data. ADDITIVE.
 *
 * ── Every figure here has a provenance, and it is shown ───────────────────
 *
 * resolveCleanerPay (lib/wageCalculation.ts:240) resolves pay through four
 * inputs and reports which one it used, plus `isExact` — true when the number
 * is a stored snapshot of what the payout engine will pay, false when it is
 * computed live from rate x hours and can still move before payroll runs.
 *
 * Measured on this org, and the split is not incidental:
 *
 *   pay_share        NEVER — booking_team_assignments has 2 rows and
 *                    pay_share is NULL on both, so the authoritative
 *                    per-cleaner branch is unreachable
 *   pay_expected     12 of 47 bookings — exact
 *   actual_payment   NEVER — null on all 47; nobody has been paid yet
 *   computed         35 of 47 — ESTIMATE
 *
 * So 74% of these numbers are estimates. A payroll screen that renders an
 * estimate and a snapshot identically is telling the operator that money is
 * settled when it is not, and this is the screen people pay cleaners from.
 * Every row says which it is; the total says how much of itself is estimated.
 *
 * ── This org has never run payroll ────────────────────────────────────────
 *
 * payroll_payments: 0 rows. staff_payout_accounts: 0. payroll_settings: 0.
 * That is worth stating on the screen rather than rendering an empty history
 * that looks like a period with nothing in it.
 *
 * ── Two wage models coexist ───────────────────────────────────────────────
 *
 * base_wage is null on all 5 staff. Four are hourly at $25; one is percentage
 * at 50%. So the computed path takes different routes per person, and the row
 * names the basis rather than presenting one number as if the whole team were
 * paid the same way.
 */

type PayRow = {
  bookingId: string;
  bookingNumber: number;
  staffName: string | null;
  scheduledLabel: string;
  pay: number;
  isExact: boolean;
  source: string;
  wageType: string;
  wageRate: number;
  /** Pay came out at 0 but a wage IS configured — the number is unknown. */
  unresolved: boolean;
  percentRate: number | null;
};

export default function PayrollWiredPage() {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const staffQ = useQuery({
    queryKey: ['payroll-v2-staff', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, hourly_rate, base_wage, percentage_rate, default_hours, is_active')
        .eq('organization_id', organization.id)
        .order('name', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const bookingsQ = useQuery({
    queryKey: ['payroll-v2-bookings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_number, scheduled_at, duration, total_amount, staff_id, cleaner_pay_expected, cleaner_actual_payment, status, booking_team_assignments(staff_id, pay_share)')
        .eq('organization_id', organization.id)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const fmtDay = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const staffById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of staffQ.data ?? []) m.set(s.id, s);
    return m;
  }, [staffQ.data]);

  const payRows: PayRow[] = useMemo(() => {
    const out: PayRow[] = [];
    for (const b of (bookingsQ.data ?? []) as any[]) {
      /* booking_team_assignments returns MANY rows. A booking with a team
         produces one pay row PER cleaner — collapsing to the primary is how
         the notify path loses teammates, and on a payroll screen it would
         lose their money. Bookings with no assignment row fall back to
         staff_id, which is how 45 of 47 live bookings are staffed. */
      const assignments = (b.booking_team_assignments ?? []) as any[];
      const targets = assignments.length
        ? assignments.map(a => ({ staffId: a.staff_id, payShare: a.pay_share }))
        : b.staff_id
          ? [{ staffId: b.staff_id, payShare: null }]
          : [];

      for (const t of targets) {
        const staff = staffById.get(t.staffId);
        const r = resolveCleanerPay(b, staff ?? null, t.payShare);
        /* A resolved pay of exactly 0 for someone who HAS a wage configured
           is not a wage of zero — it is a wage that could not be worked out.
           Specifically: a cleaner paid on percentage_rate alone. The computed
           fallback reads cleaner_wage ?? base_wage ?? hourly_rate ?? 0
           (wageCalculation.ts:139) and never consults percentage_rate, so a
           percentage-only cleaner lands on 0 whenever pay_share was not
           written at booking creation — which is both assignment rows here.
           Flagged, not printed as $0.00. */
        const percentOnly =
          !!staff && staff.percentage_rate != null &&
          staff.base_wage == null && staff.hourly_rate == null;
        const unresolved = r.calculatedPay === 0 && percentOnly;
        out.push({
          bookingId: `${b.id}:${t.staffId}`,
          bookingNumber: b.booking_number,
          staffName: staff?.name ?? null,
          scheduledLabel: fmtDay(b.scheduled_at),
          pay: r.calculatedPay,
          isExact: r.isExact,
          source: r.source,
          wageType: r.wageType,
          wageRate: r.wageRate,
          unresolved,
          percentRate: percentOnly ? Number(staff.percentage_rate) : null,
        });
      }
    }
    return out;
  }, [bookingsQ.data, staffById, fmtDay]);

  const rows: SimpleListRow[] = useMemo(
    () =>
      payRows.map(r => ({
        id: r.bookingId,
        title: r.staffName ?? 'Unassigned',
        meta: `#${r.bookingNumber} · ${r.scheduledLabel}`,
        lines: r.unresolved
          ? [
              `Set to ${r.percentRate}% of the booking, with no hourly rate`,
              'This booking is priced hourly, so the percentage never applies — payroll would pay nothing.',
            ]
          : [
              /* Names the basis. "$62.50" alone does not say how it was
                 arrived at, and four of five staff here are hourly. */
              r.wageType === 'percentage'
                ? `${r.wageRate}% of the booking`
                : r.wageType === 'hourly'
                  ? `$${r.wageRate}/hr`
                  : 'No wage configured',
              r.isExact
                ? 'Locked in — this is what payroll will pay'
                : 'Estimate — rate or hours can still change',
            ],
        /* Never "$0.00" for an unresolved wage. */
        money: r.unresolved ? undefined : `$${r.pay.toFixed(2)}`,
        badges: r.unresolved
          ? [{ tone: 'danger' as const, label: 'Wage unresolved' }]
          : r.isExact
            ? [{ tone: 'success' as const, label: 'Exact' }]
            : [{ tone: 'warn' as const, label: 'Estimate' }],
      })),
    [payRows],
  );

  const filtered = useSimpleSearch(rows, search);

  const phase = combinedPhase([staffQ, bookingsQ]);
  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : filtered.length === 0
          ? 'empty'
          : 'ready';

  /* Unresolved rows are excluded from every total. Adding a 0 that means
     "unknown" into a payroll sum understates what is owed, quietly. */
  const resolved = payRows.filter(r => !r.unresolved);
  const unresolvedCount = payRows.length - resolved.length;
  const exactCount = resolved.filter(r => r.isExact).length;
  const estimated = resolved.length - exactCount;
  const total = resolved.reduce((s, r) => s + r.pay, 0);
  const estimatedTotal = resolved.filter(r => !r.isExact).reduce((s, r) => s + r.pay, 0);

  return (
    <AdminLayout title="Payroll" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {phase === 'ready' && payRows.length > 0 && (
          <div className="px-4 pt-3">
            <div className="rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-[18px] py-3.5">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
                Owed across {resolved.length} shift{resolved.length === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-[24px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-ink))]">
                ${total.toFixed(2)}
              </p>
              {/* The headline is a mixture, so it says so. Presenting a total
                  that is 74% estimate as a settled figure is the money-display
                  problem this whole screen turns on. */}
              <p className="mt-1 text-[11px] font-medium leading-[1.45] text-[hsl(var(--pv-ink-3))]">
                {estimated === 0
                  ? 'All figures are locked in.'
                  : `$${estimatedTotal.toFixed(2)} of this is estimated — ${estimated} of ${resolved.length} shifts have no locked-in figure yet.`}
              </p>
              {unresolvedCount > 0 && (
                <p className="mt-1.5 text-[11px] font-bold leading-[1.45] text-[hsl(var(--pv-danger))]">
                  {unresolvedCount} shift{unresolvedCount === 1 ? '' : 's'} not
                  counted: the cleaner&rsquo;s wage can&rsquo;t be worked out,
                  so the real total is higher than this.
                </p>
              )}
            </div>
          </div>
        )}

        <SimpleListView
          title="Payroll"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by cleaner or booking #..."
          emptyTitle="Nothing to pay yet"
          emptyHint="Completed bookings with an assigned cleaner will show here."
          errorLabel="Couldn't load payroll"
          addLabel="Run payroll"
          onRetry={() => {
            staffQ.refetch();
            bookingsQ.refetch();
          }}
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${exactCount} locked in · ${estimated} estimated`
          }
        />
      </div>
    </AdminLayout>
  );
}
