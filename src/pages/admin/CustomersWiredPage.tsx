import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useCustomers } from '@/hooks/useBookings';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import {
  effectiveCustomerStatus,
  customerDisplayName,
  type CustomerBookingStats,
} from '@/lib/customerStatus';
import { CustomersListView, useCustomerSearch, type CustomersRow, InverseHeader, StatWell } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';

/**
 * /dashboard/customers-v2 — the mobile customers list on real data.
 *
 * ADDITIVE. The live CustomersPage keeps /dashboard/customers.
 *
 * ── Two queries, and they fail independently ──────────────────────────────
 *
 * The list comes from useCustomers; the spend and visit counts come from a
 * separate aggregate over bookings. The live screen destructures the stats
 * query as `const { data: bookingStats = [] }` with no error handling at all
 * (CustomersPage.tsx:145), so a failed stats read silently becomes an empty
 * Map — and every 'lead' then stays a 'lead' even for customers with booking
 * history, because getEffectiveStatus derives from exactly that Map.
 *
 * Here the two are separate: customers failing is an error state; stats
 * failing keeps the list and says the history is missing. That distinction
 * matters because the list is still useful without spend, and useless without
 * customers.
 */

/**
 * onSelectCustomer — supplied when this body is the mobile arm of the live
 * CustomersPage, which owns the profile sheet and the dialogs it opens.
 * Without it (the -v2 preview route) the row navigates instead, which is the
 * standalone behaviour. Extending rather than replacing: the preview keeps
 * working unchanged and the live page keeps its sheet.
 */
export function CustomersMobileBody({
  onSelectCustomer,
  actions,
  onAdd,
  onMerge,
  onRowAction,
}: {
  onSelectCustomer?: (id: string) => void;
  /* Import / Export / Merge, owned by the live CustomersPage. */
  actions?: ActionChip[];
  onAdd?: () => void;
  /** Comp 7g's "⇅ Merge" control. Wired by CustomersPage to the real
      /dashboard/customers/duplicates flow; omitted on the standalone -v2
      preview route, which has no merge destination of its own. */
  onMerge?: () => void;
  /** The row kebab — same actions desktop's icon row offers. */
  onRowAction?: (row: CustomersRow, action: 'edit' | 'payment' | 'message' | 'delete') => void;
} = {}) {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');
  const [typeTab, setTypeTab] = useState<'all' | 'customer' | 'lead'>('all');

  const customersQ = useCustomers();

  /* Mirrors the live aggregate. Returns an ARRAY, not a Map — CLAUDE.md rule
     1: a Map in a persisted query result rehydrates from localStorage as {}
     and throws on the next .get(). The live query does the same and is right
     to. */
  const statsQ = useQuery({
    queryKey: ['customer-booking-stats-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('customer_id, total_amount, scheduled_at')
        .eq('organization_id', organization.id)
        .neq('status', 'cancelled');
      if (error) throw error;

      const m = new Map<string, CustomerBookingStats & { last: string | null }>();
      for (const b of data ?? []) {
        if (!b.customer_id) continue;
        const cur = m.get(b.customer_id);
        /* A null total_amount contributes nothing rather than being coerced
           to 0 — same reason money never renders as zero on failure. */
        const amt = b.total_amount === null ? 0 : Number(b.total_amount) || 0;
        if (cur) {
          cur.total_bookings++;
          cur.total_revenue += amt;
          if (!cur.last || b.scheduled_at > cur.last) cur.last = b.scheduled_at;
        } else {
          m.set(b.customer_id, {
            total_bookings: 1,
            total_revenue: amt,
            last: b.scheduled_at,
          });
        }
      }
      return Array.from(m.entries()).map(([customer_id, v]) => ({ customer_id, ...v }));
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 5,
  });

  const statsById = useMemo(() => {
    const m = new Map<string, CustomerBookingStats & { last: string | null }>();
    for (const s of statsQ.data ?? []) m.set(s.customer_id, s);
    return m;
  }, [statsQ.data]);

  const fmtDay = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const customersPhase = queryPhase(customersQ);
  const statsPhase = queryPhase(statsQ);
  const statsOk = statsPhase === 'ready';

  const all: CustomersRow[] = useMemo(
    () =>
      (customersQ.data ?? []).map((c: any) => {
        const st = statsById.get(c.id);
        /* Truthiness, not null checks: customers.address/city/zip are never
           NULL in this table but are EMPTY STRING on 3 of 8 rows. A null check
           would treat '' as a present address. */
        const loc = [c.city, c.state].filter(Boolean).join(', ');
        return {
          id: c.id,
          name: customerDisplayName(c.first_name, c.last_name),
          email: c.email ? c.email : null,
          phone: c.phone ? c.phone : null,
          location: loc || null,
          /* Explicit status beats derived; see effectiveCustomerStatus. When
             stats did not load we pass undefined rather than an empty object,
             so a 'lead' is not silently confirmed as a lead on no evidence. */
          status: effectiveCustomerStatus(c.customer_status, statsOk ? st : undefined),
          is_recurring: !!c.is_recurring,
          bookings: statsOk ? (st?.total_bookings ?? 0) : undefined,
          revenue: statsOk ? (st?.total_revenue ?? 0) : undefined,
          lastBookingLabel: statsOk && st?.last ? fmtDay(st.last) : null,
        };
      }),
    [customersQ.data, statsById, statsOk, fmtDay],
  );

  const typeFiltered = useMemo(
    () =>
      typeTab === 'all'
        ? all
        : all.filter(r => (typeTab === 'lead' ? r.status === 'lead' : r.status !== 'lead')),
    [all, typeTab],
  );

  const rows = useCustomerSearch(typeFiltered, search);

  const listState: ListState =
    customersPhase === 'error' || customersPhase === 'offline'
      ? 'error'
      : customersPhase === 'loading'
        ? 'loading'
        : rows.length === 0
          ? 'empty'
          : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {/* 7g's hero. The comp leads with the contact TOTAL and its split,
            not with the list — so the figures sit above the shell and survive
            an empty or filtered list. "leads" here means rows whose resolved
            status is lead, which is what the badge on each row shows. */}
        <CustomersListView
          header={
            <InverseHeader
              eyebrow="CRM"
              business="Customers"
              revenueLabel="All contacts"
              revenue={customersPhase === 'ready' ? String(all.length) : '—'}
              error={customersPhase === 'error' || customersPhase === 'offline'}
              onRetry={() => customersQ.refetch()}
              wells={
                <>
                  <StatWell
                    value={customersPhase === 'ready' ? String(all.filter(r => r.status !== 'lead').length) : '—'}
                    caption="customers"
                  />
                  <StatWell
                    value={customersPhase === 'ready' ? String(all.filter(r => r.status === 'lead').length) : '—'}
                    caption="leads"
                  />
                </>
              }
            />
          }
          phase={listState}
          rows={rows}
          search={search}
          onSearch={setSearch}
          statsUnavailable={customersPhase === 'ready' && !statsOk}
          sectionLabel={
            search.trim()
              ? `${rows.length} of ${typeFiltered.length} customers`
              : `${typeFiltered.length} customers`
          }
          actions={actions}
          onAdd={onAdd}
          onMerge={onMerge}
          typeTab={typeTab}
          onTypeTab={setTypeTab}
          customerCount={all.filter(r => r.status !== 'lead').length}
          leadCount={all.filter(r => r.status === 'lead').length}
          onSelect={r =>
            onSelectCustomer
              ? onSelectCustomer(r.id)
              : navigate(`/dashboard/customers?customer=${r.id}`)
          }
          onRetry={() => {
            customersQ.refetch();
            statsQ.refetch();
          }}
          onRowAction={onRowAction}
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


export default function CustomersWiredPage() {
  return (
    <AdminLayout title="Customers" subtitle="Mobile layout, live data">
      <CustomersMobileBody />
    </AdminLayout>
  );
}
