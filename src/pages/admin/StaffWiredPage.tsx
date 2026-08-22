import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { ListShell, ListSectionLabel, PersonRow, PersonRowMenu, InverseHeader, StatWell, Card, CardTitle } from '@/components/portal-v2';
import { Switch } from '@/components/ui/switch';
import { ActionChipRow } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar, Edit, KeyRound, Trash2 } from 'lucide-react';

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


/**
 * 10g's hero, exported because StaffPage renders it above the tab switcher —
 * the same reason LeadsHero is exported. Computed from the raw staff rows so
 * there is one implementation rather than two that can disagree.
 */
export function StaffHero({
  staff,
  ready,
}: {
  staff: { is_active?: boolean | null; hourly_rate?: number | null; base_wage?: number | null; percentage_rate?: number | null }[];
  ready: boolean;
}) {
  const active = staff.filter(s => s.is_active === true).length;
  /* The one thing on this screen that costs somebody money: nobody with a
     wage set at all would be paid $0 for the work they do. */
  const payoutIssues = staff.filter(
    s => s.hourly_rate == null && s.base_wage == null && s.percentage_rate == null,
  ).length;

  return (
    <InverseHeader
      eyebrow="Team"
      business="Staff"
      revenueLabel="All staff"
      revenue={ready ? String(staff.length) : '—'}
      wells={
        <>
          <StatWell value={ready ? String(active) : '—'} caption="active" />
          <StatWell value={ready ? String(staff.length - active) : '—'} caption="inactive" />
          <StatWell value={ready ? String(payoutIssues) : '—'} caption="payout issues" />
        </>
      }
    />
  );
}

export function StaffMobileBody({
  actions,
  tabs,
  tab,
  onTab,
  hideHero,
  onToggleActive,
  onAddStaff,
  onRowAction,
}: {
  /* The per-row active switch desktop has. Turning it OFF is destructive —
     the page routes that through its confirmation dialog — so the control is
     only rendered when the page supplies the handler that does. */
  onToggleActive?: (id: string, next: boolean) => void;
  /* StaffPage renders the hero and the four tabs itself, above the tab
     content, so they stay on screen when a non-team tab is open. Without
     that, switching to Documents unmounted this body and took the tab bar
     with it — no way back. */
  hideHero?: boolean;
  actions?: ActionChip[];
  /* 10g's Team / Documents / Activity / Time Off. Supplied by StaffPage,
     which owns the real tab state — these are not decorative. */
  tabs?: { id: string; label: string; count?: number }[];
  tab?: string;
  onTab?: (id: string) => void;
  /* Wires the shell's title-row "Add staff" button — without this it renders
     and does nothing, the same dead-control bug the kebab menu below fixes. */
  onAddStaff?: () => void;
  /* The per-row kebab's four items. Desktop routes all four through its own
     handlers (Edit / Resend link / View schedule / Permanent delete); mobile
     reuses the exact same ones via this callback instead of re-implementing
     them, so there is one source of truth for what each action does. */
  onRowAction?: (id: string, action: 'edit' | 'resend' | 'schedule' | 'delete-permanent') => void;
} = {}) {
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

  /* 10g's compliance card needs what each person still owes. Both tables
     exist and are org-scoped; this org has none of either, which is why
     everyone reads as having nothing outstanding rather than as failing. */
  const signableQ = useQuery({
    queryKey: ['staff-v2-signable', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff_signable_documents')
        .select('id')
        .eq('organization_id', organization.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const signaturesQ = useQuery({
    queryKey: ['staff-v2-signatures', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff_signatures')
        /* signable_document_id, not document_id — the column typecheck
             caught before this could fail at runtime the way the customers
             apt_suite select would have. */
        .select('staff_id, signable_document_id')
        .eq('organization_id', organization.id);
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

  /* ── 10g's compliance card ────────────────────────────────────────────
     THREE dimensions, not the comp's four. The comp shows Hours as a pass /
     fail, but this schema documents the opposite rule: absent working_hours
     means AVAILABLE, not unconfigured (useCleanerConflicts.ts:160, and the
     comment at the top of this file). Marking it a failure would flag every
     cleaner who simply has not restricted their availability, which is most
     of them. So Hours is left out rather than shown as a red cross that is
     not true.

     Sigs counts documents this org actually requires. With none required
     there is nothing outstanding, so it passes — an org that has not set up
     signable documents should not read as one where everybody is delinquent. */
  const compliance = useMemo(() => {
    const requiredSignables = (signableQ.data ?? []).length;
    const signedByStaff = new Map<string, number>();
    for (const sg of (signaturesQ.data ?? []) as { staff_id: string }[]) {
      signedByStaff.set(sg.staff_id, (signedByStaff.get(sg.staff_id) ?? 0) + 1);
    }

    type StaffRecord = {
      id: string;
      name: string | null;
      hourly_rate: number | null;
      base_wage: number | null;
      percentage_rate: number | null;
    };
    return ((staffQ.data ?? []) as StaffRecord[]).map(st => {
      const docs = (docsByStaff.get(st.id) ?? []).length > 0;
      const sigs = requiredSignables === 0 || (signedByStaff.get(st.id) ?? 0) >= requiredSignables;
      const payout =
        st.hourly_rate != null || st.base_wage != null || st.percentage_rate != null;
      const checks = [
        { label: 'Docs', ok: docs },
        { label: 'Sigs', ok: sigs },
        { label: 'Payout', ok: payout },
      ];
      const passed = checks.filter(c => c.ok).length;
      return {
        id: st.id,
        name: st.name ?? 'Unnamed',
        pct: Math.round((passed / checks.length) * 100),
        checks,
      };
    });
  }, [staffQ.data, docsByStaff, signableQ.data, signaturesQ.data]);

  const complianceReady = compliance.filter(c => c.pct === 100).length;

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : filtered.length === 0
          ? 'empty'
          : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {/* 10g opens with the head-count and its split. */}
        {!hideHero && (
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
              {/* 10g splits the head-count three ways. Inactive is stated
                  rather than inferred — "17 total, 15 active" leaves the
                  reader to subtract. */}
              <StatWell
                value={phase === 'ready' ? String(rows.length - activeCount) : '—'}
                caption="inactive"
              />
              {/* The wage trap, surfaced in the hero as well as the row —
                  it is the one thing on this screen that costs somebody money. */}
              <StatWell
                value={phase === 'ready' ? String(rows.filter(r => r.badges.some(bd => bd.label === 'Would be paid $0')).length) : '—'}
                caption="payout issues"
              />
            </>
          }
        />
        )}
        {/* Outside ListShell — the shell renders children only when
            state === 'ready', so actions inside it vanish on an empty or
            failed list. */}
        {actions && actions.length > 0 && (
          <div className="px-5 pb-1.5 pt-1">
            <ActionChipRow actions={actions} label="Staff actions" />
          </div>
        )}

        {/* 10g's compliance card. Rendered above the shell so it survives an
            empty or failed list — who still owes paperwork does not depend on
            whether the roster below rendered. */}
        {phase === 'ready' && compliance.length > 0 && (
          <div className="px-5 pb-1.5 pt-1">
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Staff compliance</CardTitle>
                <span
                  className={
                    'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ' +
                    (complianceReady === compliance.length
                      ? 'bg-[hsl(var(--pv-success-soft))] text-[hsl(var(--pv-success))]'
                      : 'bg-[hsl(var(--pv-warn-soft))] text-[hsl(var(--pv-ink-2))]')
                  }
                >
                  {complianceReady}/{compliance.length} ready
                </span>
              </div>

              <div className="mt-2.5">
                {compliance.map(c => (
                  <div key={c.id} className="pb-3 last:pb-0">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                        {c.name}
                      </span>
                      <span
                        className={
                          'shrink-0 text-[13px] font-extrabold tabular-nums ' +
                          (c.pct === 100
                            ? 'text-[hsl(var(--pv-success))]'
                            : c.pct === 0
                              ? 'text-[hsl(var(--pv-danger))]'
                              : 'text-[hsl(var(--pv-brand))]')
                        }
                      >
                        {c.pct}%
                      </span>
                    </div>

                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--pv-sunken))]">
                      <div
                        className={
                          'h-full rounded-full ' +
                          (c.pct === 100
                            ? 'bg-[hsl(var(--pv-success))]'
                            : 'bg-[hsl(var(--pv-brand))]')
                        }
                        style={{ width: `${c.pct}%` }}
                      />
                    </div>

                    <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] font-semibold">
                      {c.checks.map(ck => (
                        <span
                          key={ck.label}
                          className={
                            ck.ok
                              ? 'text-[hsl(var(--pv-ink-3))]'
                              : 'text-[hsl(var(--pv-danger))]'
                          }
                        >
                          {ck.ok ? '\u2713' : '!'} {ck.label}
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <ListShell<string>
          title="Staff"
          /* StaffPage supplies 10g's four real tabs. Standalone (-v2) there
             is no page to switch, so the shell keeps its single all-tab. */
          tabs={tabs ?? [{ id: 'all', label: 'All staff', count: filtered.length }]}
          tab={tab ?? 'all'}
          onTab={onTab ?? (() => undefined)}
          action={{ label: 'Add staff' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or email..."
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
              actions={
                onToggleActive ? (
                  <Switch
                    checked={!r.inactive}
                    onCheckedChange={next => onToggleActive(r.id, next)}
                    aria-label={`Active: ${r.name}`}
                  />
                ) : undefined
              }
            />
          ))}
        </ListShell>
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


export default function StaffWiredPage() {
  return (
    <AdminLayout title="Staff" subtitle="Mobile layout, live data">
      <StaffMobileBody />
    </AdminLayout>
  );
}
