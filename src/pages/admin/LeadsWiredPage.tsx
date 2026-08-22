import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { leadDisplayName } from '@/lib/leadStatus';
import { LeadsListView, useLeadSearch, StatCard, type LeadsRow } from '@/components/portal-v2';
import { ActionChipRow } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/leads-v2 — the mobile leads list on real data. ADDITIVE.
 *
 * The live query is `const { data: leads = [], isLoading }` (LeadsPage.tsx:150)
 * — `error` is not destructured at all, so a failed read becomes an empty
 * array and the screen says "No leads found". That is the swallow CLAUDE.md
 * rule 5 is about, and it is one step worse than the bookings and customers
 * screens, which at least keep the error around. queryPhase() is used here so
 * error, offline, loading and empty stay four different answers.
 *
 * No .limit() on the live query either, so it inherits PostgREST's 1000-row
 * default silently. Kept the same shape rather than changing read behaviour on
 * an additive route, but it is worth knowing.
 */

/**
 * `filters` is applied to the rows HERE, not on the live page.
 *
 * The live LeadsPage keeps statusFilter / sourceFilter / monthFilter for its
 * own desktop table, and this body has its own query. Handing the sheet the
 * page's state without applying it here would have produced a filter panel
 * that changes a value nothing on screen reads — controls that look like
 * they work and do nothing, which is worse than not offering them.
 */
export function LeadsMobileBody({
  actions,
  onFilter,
  filterCount,
  filters,
}: {
  actions?: ActionChip[];
  onFilter?: () => void;
  filterCount?: number;
  filters?: { status?: string; source?: string; month?: string };
} = {}) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const leadsQ = useQuery({
    queryKey: ['leads-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        /* created_at is not unique. No .range() here so there is no page
           boundary to shuffle across, but the tiebreaker costs nothing and
           makes the order total — the same fix useBookings needed. */
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

  /* Local, not on the shared LeadsRow: createdMonth is a filter key, not
     something any row renders. */
  type Row = LeadsRow & { createdMonth: string };

  const all: Row[] = useMemo(
    () =>
      (leadsQ.data ?? []).map((l: any) => ({
        id: l.id,
        /* leads.name is one column but still carries doubled spaces from the
           import that built these rows. */
        name: leadDisplayName(l.name),
        /* leads.* uses NULL throughout — 0 empty strings across every text
           column, unlike customers. Truthiness anyway, so the same row code
           is safe against either convention. */
        email: l.email ? l.email : null,
        phone: l.phone ? l.phone : null,
        source: l.source ?? null,
        status: l.status ?? null,
        serviceInterest: l.service_interest ? l.service_interest : null,
        estimatedValue: l.estimated_value === null ? null : Number(l.estimated_value),
        createdLabel: fmtDay(l.created_at),
        createdMonth: (l.created_at ?? '').slice(0, 7),
        hasMessage: !!l.message,
      })),
    [leadsQ.data, fmtDay],
  );

  /* Applied before the search so the count under the search box describes
     what is actually on screen. `month` is the created_at YYYY-MM, matching
     the live page's monthOptions values. */
  const filteredAll = useMemo(() => {
    const f = filters;
    if (!f) return all;
    return all.filter(r => {
      if (f.status && f.status !== 'all' && r.status !== f.status) return false;
      if (f.source && f.source !== 'all' && r.source !== f.source) return false;
      if (f.month && f.month !== 'all' && !(r.createdMonth ?? '').startsWith(f.month)) return false;
      return true;
    });
  }, [all, filters]);

  const rows = useLeadSearch(filteredAll, search);
  const phase = queryPhase(leadsQ);

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : rows.length === 0
          ? 'empty'
          : 'ready';

  /* 8g's header pair. Conversion is a RATIO, so it is suppressed rather than
     zeroed on a failed read — "0% conversion" is a verdict on the whole
     pipeline, not a reading. */
  const converted = (leadsQ.data ?? []).filter((l: any) => l.status === 'converted').length;
  const lost = (leadsQ.data ?? []).filter((l: any) => l.status === 'lost').length;
  /* Conversion is undefined until leads actually RESOLVE. All 6 live leads
     are still open — none converted, none lost — and reporting "0%" there
     says the pipeline is failing when nothing has concluded yet. A rate needs
     a denominator of finished things, so it is suppressed until at least one
     lead has landed either way. Distinct again from a failed read, which also
     shows "—" but says so in the caption. */
  const resolved = converted + lost;
  const conversionPct = resolved > 0 ? Math.round((converted / resolved) * 100) : null;
  const ready = phase === 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="Total leads"
              value={ready ? String(all.length) : '—'}
              caption={
                ready
                  ? `${(leadsQ.data ?? []).filter((l: any) => l.status === 'follow_up').length} need follow-up`
                  : 'across all sources'
              }
            />
            <StatCard
              label="Conversion"
              value={ready && conversionPct !== null ? `${conversionPct}%` : '—'}
              caption={
                !ready
                  ? 'converted / resolved'
                  : conversionPct === null
                    ? 'no leads resolved yet'
                    : `${converted} converted · ${lost} lost`
              }
            />
          </div>
        </div>
        <LeadsListView
          actions={actions}
          onFilter={onFilter}
          filterCount={filterCount}
          phase={listState}
          rows={rows}
          search={search}
          onSearch={setSearch}
          /* Counts the set actually on screen. Reporting all.length while a
             status or month filter is narrowing the list would have the label
             contradict the rows underneath it — the filter would look broken
             even when it worked. */
          sectionLabel={
            search.trim() || filteredAll.length !== all.length
              ? `${rows.length} of ${all.length} leads`
              : `${all.length} leads`
          }
          onSelect={r => navigate(`/dashboard/leads?lead=${r.id}`)}
          onRetry={() => leadsQ.refetch()}
        />
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


export default function LeadsWiredPage() {
  return (
    <AdminLayout title="Leads" subtitle="Mobile layout, live data">
      <LeadsMobileBody />
    </AdminLayout>
  );
}
