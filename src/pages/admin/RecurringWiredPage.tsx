import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { customerDisplayName } from '@/lib/customerStatus';
import { frequencyLabel, dayName } from '@/lib/frequencyLabel';
import { SimpleListView, useSimpleSearch, InverseHeader, StatWell, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/recurring-v2 — recurring schedules on real data. ADDITIVE.
 *
 * ── Two slugs, and one of them is an integer ──────────────────────────────
 *
 * `frequency` holds slugs — live values here are 'weekly', 'biweekly' and
 * 'triweekly', and the wider canonical set (recurringDiscount.ts) adds
 * one_time, monthly and 'anyday'. Nothing in src/lib mapped them; the only
 * labels that existed were inline in BookingStepper (:1596). frequencyLabel
 * now holds them, including the custom_<uuid> case where the org's own name
 * for the schedule is the only useful part.
 *
 * `preferred_day` is an INTEGER day index — live values 0, 3, 4 — not a name.
 * Rendering the column prints "4". The live screen maps it correctly at
 * RecurringBookingsPage:721 via DAYS_OF_WEEK; dayName() does the same here.
 *
 * ── A paused schedule generates nothing ───────────────────────────────────
 *
 * is_active is what decides whether visits keep being created. All 4 live rows
 * are active, so the paused case cannot be seen here — but a list that showed
 * only names would make a paused schedule look like a running one, and that is
 * a schedule quietly not billing anybody. Stated on every row.
 *
 * ── next_scheduled_at vs ends_at ──────────────────────────────────────────
 *
 * ends_at is null on 3 of 4 — most schedules run until cancelled. A null there
 * means "no end date", not "ended", and the two must not read alike.
 */

export default function RecurringWiredPage() {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const recurringQ = useQuery({
    queryKey: ['recurring-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('recurring_bookings')
        .select(`
          id, frequency, preferred_day, preferred_time, total_amount, is_active,
          next_scheduled_at, last_generated_at, ends_at, address, city,
          customer:customers(first_name, last_name),
          service:services(name),
          staff:staff(name)
        `)
        .eq('organization_id', organization.id)
        .order('next_scheduled_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  /* Custom frequencies, so a custom_<uuid> can render the org's own name for
     it rather than the word "Custom". 0 rows on this org, which is why the
     fallback matters. */
  const customFreqQ = useQuery({
    queryKey: ['recurring-v2-custom-freq', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('custom_frequencies')
        .select('id, name')
        .eq('organization_id', organization.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const customNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of (customFreqQ.data ?? []) as any[]) m.set(c.id, c.name);
    return m;
  }, [customFreqQ.data]);

  const fmtDay = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const rows: SimpleListRow[] = useMemo(
    () =>
      (recurringQ.data ?? []).map((r: any) => {
        const who = customerDisplayName(r.customer?.first_name, r.customer?.last_name);
        const customId = String(r.frequency ?? '').startsWith('custom_')
          ? String(r.frequency).slice('custom_'.length)
          : null;
        const freq = frequencyLabel(r.frequency, customId ? customNames.get(customId) : null);
        const day = dayName(r.preferred_day);
        const active = r.is_active === true;

        return {
          id: r.id,
          title: who ?? 'Unknown customer',
          meta: r.service?.name ?? 'No service set',
          lines: [
            /* Frequency and day together — the schedule in one phrase. */
            day ? `${freq} · ${day}${r.preferred_time ? ` at ${r.preferred_time}` : ''}` : freq,
            r.staff?.name ? r.staff.name : 'No cleaner assigned',
            active
              ? r.next_scheduled_at
                ? `Next ${fmtDay(r.next_scheduled_at)}`
                : 'Active, but no next visit scheduled'
              : 'Paused — no visits are being created',
            /* Null ends_at is "runs until cancelled", not "ended". */
            r.ends_at ? `Ends ${fmtDay(r.ends_at)}` : null,
          ],
          money:
            r.total_amount === null || r.total_amount === undefined
              ? undefined
              : `$${Number(r.total_amount).toFixed(2)}`,
          badges: active
            ? [{ tone: 'success' as const, label: 'Active' }]
            : [{ tone: 'warn' as const, label: 'Paused' }],
        };
      }),
    [recurringQ.data, customNames, fmtDay],
  );

  const filtered = useSimpleSearch(rows, search);
  const phase = combinedPhase([recurringQ]);
  const activeCount = (recurringQ.data ?? []).filter((r: any) => r.is_active === true).length;

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : filtered.length === 0
          ? 'empty'
          : 'ready';

  return (
    <AdminLayout title="Recurring" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <SimpleListView
          header={
            <InverseHeader
              eyebrow="Schedules"
              business="Recurring"
              revenueLabel="Recurring schedules"
              revenue={phase === 'ready' ? String(rows.length) : '—'}
              error={phase !== 'ready'}
              onRetry={() => recurringQ.refetch()}
              wells={
                <>
                  <StatWell value={phase === 'ready' ? String(activeCount) : '—'} caption="active" />
                  <StatWell value={phase === 'ready' ? String(rows.length - activeCount) : '—'} caption="paused" />
                </>
              }
            />
          }
          title="Recurring"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by customer or service..."
          emptyTitle="No recurring schedules"
          emptyHint="Repeat bookings you set up will show here."
          errorLabel="Couldn't load recurring schedules"
          addLabel="New schedule"
          onRetry={() => {
            recurringQ.refetch();
            customFreqQ.refetch();
          }}
          /* A custom frequency whose name could not be read would print
             "Custom schedule" — accurate but less useful than the org's own
             word for it, so the degradation is named. */
          note={
            phase === 'ready' && queryPhase(customFreqQ) !== 'ready' &&
            rows.some(r => (r.lines ?? []).some(l => l?.startsWith('Custom schedule')))
              ? "Couldn't load your custom frequency names, so those schedules show as \"Custom schedule\"."
              : undefined
          }
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${activeCount} active · ${rows.length - activeCount} paused`
          }
        />
      </div>
    </AdminLayout>
  );
}
