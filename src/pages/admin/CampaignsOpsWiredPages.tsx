import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase, combinedPhase } from '@/lib/queryState';
import { Card, CardTitle, StatCard, SimpleListView, useSimpleSearch, InverseHeader, StatWell, ActionChipRow, type SimpleListRow } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * Campaigns and the operations tracker, wired. Both ADDITIVE.
 */

const CAMPAIGN_TYPE: Record<string, string> = {
  custom: 'Custom',
  seasonal_promo: 'Seasonal promotion',
  post_service: 'After a service',
  win_back: 'Win back lapsed customers',
  reminder: 'Reminder',
  inactive: 'Inactive customers',
};

/* ── Campaigns ─────────────────────────────────────────────────────────────
   THE FINDING: five campaigns are marked active and NOT ONE has ever run.

   automated_campaigns has 5 rows, every one is_active = true, and every one
   has last_run_at = NULL. campaign_runs, campaign_sms_sends and
   campaign_emails are all 0 rows.

   So "Active" on this screen means enabled, not running — and an owner
   reading a list of five Active campaigns will reasonably believe five
   campaigns are working. Nothing has ever been sent to anybody.

   Enabled and running are therefore two different badges here, and a campaign
   that has never fired says so on its own row rather than being counted in a
   total that implies activity.
   ────────────────────────────────────────────────────────────────────────── */
export function CampaignsMobileBody({
  actions,
}: {
  actions?: ActionChip[];
} = {}) {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const campaignsQ = useQuery({
    queryKey: ['campaigns-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('automated_campaigns')
        .select('id, name, type, is_active, last_run_at, days_inactive, scheduled_at, created_at')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  /* Runs are what tell you a campaign actually did something. Separate query
     so its failure does not make every campaign look like it never ran —
     which is indistinguishable from the truth here and must not be guessed. */
  const runsQ = useQuery({
    queryKey: ['campaigns-v2-runs', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('campaign_runs')
        .select('campaign_id, started_at, status')
        .eq('organization_id', organization.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const runsOk = queryPhase(runsQ) === 'ready';
  const runsByCampaign = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (runsQ.data ?? []) as any[]) {
      m.set(r.campaign_id, (m.get(r.campaign_id) ?? 0) + 1);
    }
    return m;
  }, [runsQ.data]);

  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const rows: SimpleListRow[] = useMemo(
    () =>
      (campaignsQ.data ?? []).map((c: any) => {
        const enabled = c.is_active === true;
        const runCount = runsByCampaign.get(c.id) ?? 0;
        const neverRun = !c.last_run_at && (runsOk ? runCount === 0 : true);

        return {
          id: c.id,
          title: c.name ?? 'Untitled campaign',
          meta: CAMPAIGN_TYPE[c.type] ?? c.type,
          lines: [
            c.last_run_at
              ? `Last ran ${fmt(c.last_run_at)}`
              : 'Has never run',
            runsOk
              ? runCount === 0
                ? 'No sends recorded'
                : `${runCount} run${runCount === 1 ? '' : 's'} recorded`
              : 'Run history unavailable',
            c.days_inactive != null ? `Triggers after ${c.days_inactive} days inactive` : null,
          ],
          badges: [
            enabled
              ? { tone: 'info' as const, label: 'Enabled' }
              : { tone: 'warn' as const, label: 'Off' },
            /* The distinction the live screen does not draw. */
            ...(enabled && neverRun
              ? [{ tone: 'warn' as const, label: 'Never fired' }]
              : []),
          ],
        };
      }),
    [campaignsQ.data, runsByCampaign, runsOk, fmt],
  );

  const filtered = useSimpleSearch(rows, search);
  const phase = combinedPhase([campaignsQ]);
  const enabledCount = (campaignsQ.data ?? []).filter((c: any) => c.is_active === true).length;
  const neverRunCount = (campaignsQ.data ?? []).filter(
    (c: any) => c.is_active === true && !c.last_run_at && (runsByCampaign.get(c.id) ?? 0) === 0,
  ).length;

  const listState: ListState =
    phase === 'error' || phase === 'offline' ? 'error'
      : phase === 'loading' ? 'loading'
      : filtered.length === 0 ? 'empty' : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {actions && actions.length > 0 && (
          <ActionChipRow actions={actions} label="Campaign actions" />
        )}

        {phase === 'ready' && neverRunCount > 0 && (
          <div className="px-4 pt-3">
            <Card>
              <CardTitle>
                {neverRunCount === 1
                  ? '1 enabled campaign has never run'
                  : `${neverRunCount} enabled campaigns have never run`}
              </CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                Enabled is not the same as running. Nothing has been sent to
                anybody by {neverRunCount === 1 ? 'this campaign' : 'these campaigns'} yet.
              </p>
            </Card>
          </div>
        )}
        <SimpleListView
          header={
            <InverseHeader
              eyebrow="Automation"
              business="Campaigns"
              revenueLabel="Campaigns"
              revenue={phase === 'ready' ? String(rows.length) : '—'}
              error={phase !== 'ready'}
              onRetry={() => { campaignsQ.refetch(); runsQ.refetch(); }}
              wells={
                <>
                  <StatWell value={phase === 'ready' ? String(enabledCount) : '—'} caption="enabled" />
                  {/* The number that matters on this screen: enabled is not
                      running, and five of five have never fired. */}
                  <StatWell value={phase === 'ready' ? String(neverRunCount) : '—'} caption="never fired" />
                </>
              }
            />
          }
          title="Campaigns"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search campaigns..."
          emptyTitle="No campaigns yet"
          emptyHint="Automated messages you set up will show here."
          errorLabel="Couldn't load campaigns"
          addLabel="New campaign"
          onRetry={() => { campaignsQ.refetch(); runsQ.refetch(); }}
          note={
            phase === 'ready' && !runsOk
              ? "Couldn't load run history, so \"never run\" below reflects the campaign record only."
              : undefined
          }
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${enabledCount} enabled · ${neverRunCount} never fired`
          }
        />
      </div>
    </>
  );
}

/* ── Operations tracker ────────────────────────────────────────────────────
   Hand-entered numbers, so a missing day is a missing RECORD, not a quiet day.
   The live org has exactly ONE entry, dated 2026-01-21 — months old. A screen
   showing that entry's figures as though they were current would be wrong in
   the most ordinary way available.
   ────────────────────────────────────────────────────────────────────────── */
/**
 * `actions` are the live OperationsTrackerPage's Export, Add Entry and its
 * date range. Optional, so /dashboard/operations-v2 is unchanged.
 */
export function OperationsMobileBody({
  actions,
}: {
  actions?: ActionChip[];
} = {}) {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();

  const q = useQuery({
    queryKey: ['operations-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('operations_tracker')
        .select('*')
        .eq('organization_id', organization.id)
        .order('track_date', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const orgToday = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: orgTz || 'UTC',
    });
    return f.format(new Date());
  }, [orgTz]);

  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (d: string) => f.format(new Date(`${d}T12:00:00Z`));
  }, [orgTz]);

  const phase = queryPhase(q);
  const entries = (q.data ?? []) as any[];
  const latest = entries[0];
  const todaysEntry = entries.find(e => e.track_date === orgToday);
  const daysStale = latest
    ? Math.round(
        (new Date(`${orgToday}T12:00:00Z`).getTime() - new Date(`${latest.track_date}T12:00:00Z`).getTime()) / 86400000,
      )
    : null;

  /* Every figure is nullable, and a null is not a zero: "0 cold calls" is a
     day somebody worked and made none, "—" is a box nobody filled in. */
  const num = (v: unknown) => (v === null || v === undefined ? '—' : String(v));

  return (
    <>
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
        {actions && actions.length > 0 && (
          <ActionChipRow actions={actions} label="Operations actions" />
        )}

        {phase === 'error' || phase === 'offline' ? (
          <Card>
            <CardTitle>Couldn&rsquo;t load your operations log</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              Nothing is shown rather than shown wrong. These figures are typed
              in by hand, so a blank screen and a quiet week look identical
              unless we say which this is.
            </p>
          </Card>
        ) : phase === 'loading' ? (
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">Loading…</p>
        ) : entries.length === 0 ? (
          <Card>
            <CardTitle>Nothing logged yet</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              This log is filled in by hand at the end of a day. No entries have
              been recorded.
            </p>
          </Card>
        ) : (
          <>
            {!todaysEntry && (
              <Card>
                <CardTitle>No entry for today</CardTitle>
                <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  Nothing has been recorded today. That is different from a day
                  with no calls — showing zeroes would make an unfilled day look
                  like a quiet one.
                </p>
                {daysStale !== null && daysStale > 1 && (
                  <p className="mt-2 text-[11.5px] font-bold leading-[1.45] text-[hsl(var(--pv-warn))]">
                    The most recent entry is {daysStale} days old
                    ({fmt(latest.track_date)}). The figures below are from then,
                    not from now.
                  </p>
                )}
              </Card>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <StatCard label="Incoming calls" value={num(latest.incoming_calls)} caption={fmt(latest.track_date)} />
              <StatCard label="Closed deals" value={num(latest.closed_deals)} caption={fmt(latest.track_date)} />
              <StatCard
                label="Revenue booked"
                value={latest.revenue_booked === null ? '—' : `$${Number(latest.revenue_booked).toFixed(2)}`}
                caption={fmt(latest.track_date)}
              />
              <StatCard label="Jobs completed" value={num(latest.jobs_completed)} caption={fmt(latest.track_date)} />
            </div>

            <Card>
              <CardTitle>Outreach on {fmt(latest.track_date)}</CardTitle>
              <div className="mt-2">
                {[
                  ['Cold calls made', latest.cold_calls_made],
                  ['Cold emails sent', latest.cold_emails_sent],
                  ['Leads followed up', latest.leads_followed_up],
                ].map(([label, v]) => (
                  <div key={label as string} className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] py-2.5 last:border-b-0">
                    <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">{label as string}</span>
                    <span className="shrink-0 tabular-nums text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">{num(v)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
                A dash means the box was left blank, not that the number was
                zero.
              </p>
            </Card>

            <p className="px-1 text-[11px] text-[hsl(var(--pv-ink-3))]">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} logged in total.
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


export function CampaignsWiredPage() {
  return (
    <AdminLayout title="Campaigns" subtitle="Mobile layout, live data">
      <CampaignsMobileBody />
    </AdminLayout>
  );
}

export function OperationsWiredPage() {
  return (
    <AdminLayout title="Operations" subtitle="Mobile layout, live data">
      <OperationsMobileBody />
    </AdminLayout>
  );
}
