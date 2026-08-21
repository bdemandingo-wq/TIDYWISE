import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { ListShell, ListSectionLabel, PersonRow, InverseHeader, StatWell } from '@/components/portal-v2';
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

  /* PersonRow, not a generic list row — this is the 10g comp's component and
     it is the right one for staff: an avatar, an `inactive` treatment that
     dims the whole row instead of adding a pill, and a separation between
     "deactivated" and "this row's data failed" that a status badge cannot
     express. */
  type Row = {
    id: string; name: string; facts: string[]; lines: string[];
    inactive: boolean;
    badges: { tone: 'info' | 'success' | 'warn' | 'danger'; label: string }[];
  };

  const rows: Row[] = useMemo(
    () =>
      (staffQ.data ?? []).map((s: any) => {
        const h = hoursByStaff.get(s.id);
        const docs = docsByStaff.get(s.id) ?? [];
        const pendingDocs = docs.filter(d => d.status !== 'approved').length;

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
          name: s.name ?? 'Unnamed',
          /* Short and scannable — the comp puts the pay rate here. */
          facts: [wage],
          lines: [
            s.email ?? 'No email',
            availability,
            docsOk
              ? docs.length === 0
                ? 'No documents on file'
                : `${docs.length} document${docs.length === 1 ? '' : 's'}: ${docs.map(d => DOC_LABEL[d.document_type] ?? d.document_type).join(', ')}`
              : 'Documents unavailable',
          ],
          /* The comp's own treatment: an inactive cleaner dims rather than
             wearing a pill. */
          inactive: s.is_active !== true,
          badges: [
            ...(s.tax_classification
              ? [{ tone: 'info' as const, label: TAX_LABEL[s.tax_classification] ?? s.tax_classification }]
              : []),
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

  const filtered = useMemo(() => {
    const qy = search.trim().toLowerCase();
    if (!qy) return rows;
    return rows.filter(
      r => r.name.toLowerCase().includes(qy) || r.lines.some(l => l.toLowerCase().includes(qy)),
    );
  }, [rows, search]);
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
        {/* 10g opens with the head-count and its split. */}
        <InverseHeader
          eyebrow="Team"
          business="Staff"
          revenueLabel="Team members"
          revenue={phase === 'ready' ? String(rows.length) : '—'}
          error={phase !== 'ready'}
          onRetry={() => staffQ.refetch()}
          wells={
            <>
              <StatWell value={phase === 'ready' ? String(activeCount) : '—'} caption="active" />
              {/* The wage trap, surfaced in the hero as well as the row —
                  it is the one thing on this screen that costs somebody money. */}
              <StatWell
                value={phase === 'ready' ? String(rows.filter(r => r.badges.some(bd => bd.label === 'Would be paid $0')).length) : '—'}
                caption="wage unset"
              />
            </>
          }
        />
        <ListShell<'all'>
          title="Staff"
          action={{ label: 'Add staff' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or email..."
          tabs={[{ id: 'all', label: 'All staff', count: filtered.length }]}
          tab="all"
          onTab={() => undefined}
          state={listState}
          empty={{
            title: 'No team members yet',
            hint: 'Cleaners and office staff you add will show here.',
            action: { label: 'Add staff' },
          }}
          errorLabel="Couldn't load your team"
          onRetry={() => {
            staffQ.refetch();
            hoursQ.refetch();
            docsQ.refetch();
          }}
          skeletonRows={5}
        >
          <ListSectionLabel>
            {search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${activeCount} active · ${rows.length - activeCount} inactive`}
          </ListSectionLabel>

          {phase === 'ready' && (!hoursOk || !docsOk) && (
            <p className="mx-4 mb-2 rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
              Couldn&rsquo;t load {!hoursOk && !docsOk ? 'availability or documents' : !hoursOk ? 'availability' : 'documents'}. The team list itself is complete.
            </p>
          )}

          {filtered.map(r => (
            <PersonRow
              key={r.id}
              name={r.name}
              facts={r.facts}
              lines={r.lines}
              inactive={r.inactive}
              badges={r.badges}
            />
          ))}
        </ListShell>
      </div>
    </AdminLayout>
  );
}
