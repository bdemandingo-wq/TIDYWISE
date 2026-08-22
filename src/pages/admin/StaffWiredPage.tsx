import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { SimpleListView, useSimpleSearch, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/staff-v2 — the team on real data. ADDITIVE.
 *
 * ── Absent working hours means AVAILABLE, not unavailable ─────────────────
 *
 * Only 2 of 5 live staff have any working_hours rows. The obvious reading is
 * that the other three cannot be booked, and that is backwards:
 * useCleanerConflicts.ts:160 documents the rule — "Returns false ONLY if the
 * staff has working hours configured AND the day is explicitly blocked" — so
 * no rows means bookable any day, and configuring hours RESTRICTS.
 *
 * A row saying "no availability set" would therefore read as a problem when it
 * is the permissive default. It says "any day" instead, and only counts
 * restricted days for the staff who actually have a schedule.
 *
 * ── Two slug columns ──────────────────────────────────────────────────────
 *
 * tax_classification holds 'w2' and '1099' — rendering the column prints "w2",
 * which is not how anyone writes it. staff_documents.document_type holds 'id'
 * and 'insurance'.
 *
 * ── The wage configuration this screen can catch early ────────────────────
 *
 * A cleaner with percentage_rate set and no hourly rate resolves to $0.00 in
 * the payout fallback — see fix/percentage-wage-fallback. One of these five is
 * configured that way. The staff row is where that is visible BEFORE payroll
 * runs, so it is flagged here rather than discovered on a payslip.
 */

const TAX_LABEL: Record<string, string> = {
  w2: 'W-2 employee',
  '1099': '1099 contractor',
};

const DOC_LABEL: Record<string, string> = {
  id: 'ID',
  insurance: 'Insurance',
  contract: 'Contract',
  certification: 'Certification',
};

export default function StaffWiredPage() {
  const { organization } = useOrganization();
  const [search, setSearch] = useState('');

  const staffQ = useQuery({
    queryKey: ['staff-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, phone, is_active, tax_classification, hourly_rate, base_wage, percentage_rate, default_hours')
        .eq('organization_id', organization.id)
        .order('name', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const hoursQ = useQuery({
    queryKey: ['staff-v2-hours', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const ids = (staffQ.data ?? []).map((s: any) => s.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('working_hours')
        .select('staff_id, day_of_week, is_available')
        .in('staff_id', ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id && (staffQ.data ?? []).length > 0,
  });

  const docsQ = useQuery({
    queryKey: ['staff-v2-docs', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff_documents')
        .select('staff_id, document_type, status')
        .eq('organization_id', organization.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const hoursByStaff = useMemo(() => {
    const m = new Map<string, { days: number; available: number }>();
    for (const h of (hoursQ.data ?? []) as any[]) {
      const cur = m.get(h.staff_id) ?? { days: 0, available: 0 };
      cur.days++;
      if (h.is_available) cur.available++;
      m.set(h.staff_id, cur);
    }
    return m;
  }, [hoursQ.data]);

  const docsByStaff = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const d of (docsQ.data ?? []) as any[]) {
      const cur = m.get(d.staff_id) ?? [];
      cur.push(d);
      m.set(d.staff_id, cur);
    }
    return m;
  }, [docsQ.data]);

  const hoursOk = queryPhase(hoursQ) === 'ready';
  const docsOk = queryPhase(docsQ) === 'ready';

  const rows: SimpleListRow[] = useMemo(
    () =>
      (staffQ.data ?? []).map((s: any) => {
        const h = hoursByStaff.get(s.id);
        const docs = docsByStaff.get(s.id) ?? [];
        const pendingDocs = docs.filter(d => d.status !== 'approved').length;

        /* No rows is the permissive default, not a gap. */
        const availability = !hoursOk
          ? 'Availability unavailable'
          : !h
            ? 'Available any day — no restrictions set'
            : h.available === 0
              ? 'Every day blocked — cannot be booked'
              : `Available ${h.available} of ${h.days} days`;

        const percentOnly =
          s.percentage_rate != null && s.base_wage == null && s.hourly_rate == null;

        const wage = percentOnly
          ? `${s.percentage_rate}% — no hourly rate set`
          : s.hourly_rate != null
            ? `$${s.hourly_rate}/hr`
            : s.base_wage != null
              ? `$${s.base_wage} base`
              : 'No wage configured';

        return {
          id: s.id,
          title: s.name ?? 'Unnamed',
          meta: s.email ?? 'No email',
          lines: [
            s.tax_classification
              ? (TAX_LABEL[s.tax_classification] ?? s.tax_classification)
              : 'No tax classification',
            wage,
            availability,
            docsOk
              ? docs.length === 0
                ? 'No documents on file'
                : `${docs.length} document${docs.length === 1 ? '' : 's'}: ${docs.map(d => DOC_LABEL[d.document_type] ?? d.document_type).join(', ')}`
              : null,
          ],
          badges: [
            s.is_active === true
              ? { tone: 'success' as const, label: 'Active' }
              : { tone: 'info' as const, label: 'Inactive' },
            /* The wage trap, caught before payroll rather than on a payslip. */
            ...(percentOnly
              ? [{ tone: 'danger' as const, label: 'Would be paid $0' }]
              : []),
            ...(pendingDocs > 0
              ? [{ tone: 'warn' as const, label: `${pendingDocs} doc${pendingDocs === 1 ? '' : 's'} pending` }]
              : []),
          ],
        };
      }),
    [staffQ.data, hoursByStaff, docsByStaff, hoursOk, docsOk],
  );

  const filtered = useSimpleSearch(rows, search);
  const phase = combinedPhase([staffQ]);
  const activeCount = (staffQ.data ?? []).filter((s: any) => s.is_active === true).length;

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : filtered.length === 0
          ? 'empty'
          : 'ready';

  return (
    <AdminLayout title="Staff" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <SimpleListView
          title="Staff"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or email..."
          emptyTitle="No team members yet"
          emptyHint="Cleaners and office staff you add will show here."
          errorLabel="Couldn't load your team"
          addLabel="Add staff"
          onRetry={() => {
            staffQ.refetch();
            hoursQ.refetch();
            docsQ.refetch();
          }}
          note={
            phase === 'ready' && (!hoursOk || !docsOk)
              ? `Couldn't load ${!hoursOk && !docsOk ? 'availability or documents' : !hoursOk ? 'availability' : 'documents'}. The team list itself is complete.`
              : undefined
          }
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${activeCount} active · ${rows.length - activeCount} inactive`
          }
        />
      </div>
    </AdminLayout>
  );
}
