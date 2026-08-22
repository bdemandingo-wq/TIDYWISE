import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { customerDisplayName } from '@/lib/customerStatus';
import { SimpleListView, useSimpleSearch, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/invoices-v2 — invoices on real data. ADDITIVE.
 *
 * ── Both kinds of zero live on this screen, and the org has one of each ───
 *
 * The single live invoice is #5, status `cancelled`, with subtotal, tax,
 * discount and total ALL genuinely 0 and ZERO invoice_items. That is a real
 * $0.00 — an empty invoice that was cancelled — and it must render as $0.00,
 * because "—" would say the figure could not be read.
 *
 * A failed read is the opposite and must render "—", never $0.00.
 *
 * So this screen cannot use one rule for money. It uses the read's phase to
 * decide which zero it is looking at, which is the whole reason queryPhase
 * exists.
 *
 * ── An invoice bills a customer OR a lead ─────────────────────────────────
 *
 * Two nullable joins for one idea. customer_id is set and lead_id null on the
 * live row, but the schema and the live query (:174) support either, and an
 * invoice with neither is possible. The row resolves customer, then lead, then
 * says the recipient is missing rather than rendering a blank.
 *
 * ── invoice_items is multi-row, and empty here ────────────────────────────
 *
 * The total is stored on the invoice, not summed from items — so an invoice
 * with no items still carries a total. On the live row both are 0 so they
 * agree, but they can disagree, and an itemless invoice is worth saying out
 * loud rather than showing a total with nothing behind it.
 *
 * ── Overdue is NOT derived here, deliberately ─────────────────────────────
 *
 * `overdue` is written by exactly one place: send-invoice-reminder/index.ts:45,
 * which flips status='sent' AND due_date < today to 'overdue'. So the status
 * depends on that cron having run, not on the date.
 *
 * useSidebarBadges.ts:188 documents the decision to read the STORED status
 * anyway — it used to derive its own and that made the sidebar and the page
 * disagree whenever the cron lagged. "One definition, maintained by that cron,
 * beats two that are each defensible." Re-deriving here would recreate exactly
 * that split, so the status shown is the stored one.
 *
 * What the row DOES add is the observation, not a second status: when a due
 * date has passed and the status still says sent, it says the due date passed.
 * That is a fact about the date, not a competing claim about the invoice.
 */

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<string, 'success' | 'info' | 'warn' | 'danger'> = {
  draft: 'info',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'warn',
};

export function InvoicesMobileBody() {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['invoices-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, total_amount, status, due_date, paid_at, sent_at,
          customer:customers(first_name, last_name),
          lead:leads(name),
          invoice_items(id)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        /* created_at is not unique. */
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const fmtDay = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (d: string) => f.format(new Date(`${d}T12:00:00Z`));
  }, [orgTz]);

  const phase = queryPhase(q);
  const ready = phase === 'ready';

  /* Today in the ORG's timezone, as a plain YYYY-MM-DD, so a due date is not
     judged past by the viewer's clock. due_date is a DATE column, not a
     timestamp — comparing it to a device Date is how an invoice reads overdue
     a day early for anyone west of the business. */
  const orgToday = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: orgTz || 'UTC',
    });
    return f.format(new Date());
  }, [orgTz]);

  const rows: SimpleListRow[] = useMemo(
    () =>
      (q.data ?? []).map((inv: any) => {
        const who =
          customerDisplayName(inv.customer?.first_name, inv.customer?.last_name) ??
          customerDisplayName(inv.lead?.name, null) ??
          null;
        const itemCount = (inv.invoice_items ?? []).length;
        const total = Number(inv.total_amount ?? 0);
        /* Stored status only. The date observation is separate. */
        const duePassed =
          !!inv.due_date && inv.due_date < orgToday && inv.status === 'sent';

        return {
          id: inv.id,
          title: who ?? 'No recipient on this invoice',
          meta: `#${inv.invoice_number}`,
          lines: [
            inv.due_date ? `Due ${fmtDay(inv.due_date)}` : 'No due date',
            /* A total with nothing behind it is worth saying. */
            itemCount === 0
              ? 'No line items'
              : `${itemCount} line item${itemCount === 1 ? '' : 's'}`,
            duePassed
              ? 'Due date has passed — not yet marked overdue'
              : inv.paid_at
                ? `Paid ${fmtDay(String(inv.paid_at).slice(0, 10))}`
                : inv.sent_at
                  ? `Sent ${fmtDay(String(inv.sent_at).slice(0, 10))}`
                  : 'Not sent',
          ],
          /* A GENUINE zero renders as $0.00 — the live invoice really does
             total nothing. Only an unread figure becomes "—", and phase is
             what tells them apart. */
          money: ready ? money(total) : '—',
          badges: [
            {
              tone: STATUS_TONE[inv.status] ?? 'info',
              label: inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
            },
            ...(duePassed ? [{ tone: 'danger' as const, label: 'Past due' }] : []),
          ],
        };
      }),
    [q.data, ready, fmtDay, orgToday],
  );

  const filtered = useSimpleSearch(rows, search);

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : filtered.length === 0
          ? 'empty'
          : 'ready';

  const paidTotal = useMemo(
    () =>
      (q.data ?? [])
        .filter((i: any) => i.status === 'paid')
        .reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0),
    [q.data],
  );

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {ready && rows.length > 0 && (
          <div className="px-4 pt-3">
            <div className="rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-[18px] py-3.5">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
                Collected from invoices
              </p>
              <p className="mt-1 text-[24px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-ink))]">
                {money(paidTotal)}
              </p>
              <p className="mt-1 text-[11px] font-medium text-[hsl(var(--pv-ink-3))]">
                Paid invoices only — {rows.length} invoice
                {rows.length === 1 ? '' : 's'} in total
              </p>
            </div>
          </div>
        )}

        <SimpleListView
          title="Invoices"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or invoice #..."
          emptyTitle="No invoices yet"
          emptyHint="Invoices you raise will show here."
          errorLabel="Couldn't load invoices"
          addLabel="New invoice"
          onRetry={() => q.refetch()}
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${rows.length} invoice${rows.length === 1 ? '' : 's'}`
          }
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


export default function InvoicesWiredPage() {
  return (
    <AdminLayout title="Invoices" subtitle="Mobile layout, live data">
      <InvoicesMobileBody />
    </AdminLayout>
  );
}
