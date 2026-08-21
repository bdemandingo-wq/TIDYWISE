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

export default function LeadsWiredPage() {
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

  const all: LeadsRow[] = useMemo(
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
        hasMessage: !!l.message,
      })),
    [leadsQ.data, fmtDay],
  );

  const rows = useLeadSearch(all, search);
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
    <AdminLayout title="Leads" subtitle="Mobile layout, live data">
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
          phase={listState}
          rows={rows}
          search={search}
          onSearch={setSearch}
          sectionLabel={
            search.trim() ? `${rows.length} of ${all.length} leads` : `${all.length} leads`
          }
          onSelect={r => navigate(`/dashboard/leads?lead=${r.id}`)}
          onRetry={() => leadsQ.refetch()}
        />
      </div>
    </AdminLayout>
  );
}
