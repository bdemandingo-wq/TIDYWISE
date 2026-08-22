import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { queryPhase } from '@/lib/queryState';
import { SimpleListView, useSimpleSearch, InverseHeader, StatWell, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * The eight simple screens, wired to real data. All ADDITIVE — every live
 * admin page keeps its own route.
 *
 * They share one file because they share one finding: not one of these
 * screens keeps its query error. Measured across all six admin pages plus two
 * custom hooks:
 *
 *   ChecklistsPage:  { data: templates = [], isLoading }   error dropped
 *   InventoryPage:   { data: items = [], isLoading }       error dropped
 *   TasksPage:       { data: tasks = [], isLoading }       error dropped
 *   DiscountsPage:   useDiscounts()                        catch -> console.error, no error state
 *   ServicesPage:    useServicePricing()                   error thrown but not surfaced
 *   NotificationsPage: settings-shaped, no list query
 *
 * So on all of them a failed read renders as "nothing here yet", which is the
 * exact swallow CLAUDE.md rule 5 names. queryPhase() keeps error, offline,
 * loading and empty separate on every route below.
 *
 * ── A latent nullability bug, not yet biting ──────────────────────────────
 *
 * The generated schema types say these are nullable booleans:
 *
 *   discounts.is_active, discounts.is_test,
 *   client_feedback.is_resolved, client_feedback.followup_needed,
 *   checklist_items.requires_photo
 *
 * The hand-written interfaces in front of them do not. useDiscounts.ts:18
 * declares `is_active: boolean`; ChecklistsPage.tsx:53 declares
 * `requires_photo: boolean`. Both feed a controlled <Switch checked={...}>
 * (DiscountsPage:350, ChecklistsPage:124), and a null there makes React treat
 * the input as uncontrolled. DiscountsPage:123 would also toggle a null to
 * true on the first tap regardless of intent, and :125 would report
 * "activated" either way.
 *
 * Counted on the live org: ZERO rows currently null in any of the five. So
 * this is a real hole that nothing is falling through today. Rows here treat
 * them as three-state anyway, because the schema permits it and the cost is a
 * single `=== true`.
 */

type Cfg = {
  title: string;
  table: string;
  order: { col: string; asc: boolean };
  emptyTitle: string;
  emptyHint: string;
  map: (r: any) => SimpleListRow;
  searchPlaceholder?: string;
  /** Used when the count is exactly 1. */
  singular?: string;
  /* ── The comp's InverseHeader ──────────────────────────────────────────
     Most of these screens open with a dark hero carrying a headline figure
     and two or three wells. Built from the loaded rows, so it is a function
     rather than a node — and it takes the phase, because §5.1 applies to a
     hero figure exactly as it does to a row: an errored header passes "—"
     and sets InverseHeader's own `error` flag rather than rendering a
     confident zero in 32px type. */
  header?: (rows: any[], ready: boolean) => { eyebrow: string; label: string; value: string; wells: { value: string; caption: string }[] };
};

/** Shared plumbing: one query, one phase, one view. */
function useSimpleScreen(cfg: Cfg) {
  const { organization } = useOrganization();
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: [`simple-${cfg.table}`, organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from(cfg.table as never)
        .select('*')
        .eq('organization_id', organization.id)
        .order(cfg.order.col, { ascending: cfg.order.asc })
        /* Unique tiebreaker on every one of these. None uses .range() today,
           but ordering by a non-unique column is how the bookings list ended
           up able to drop rows, and it costs nothing to make the sort total. */
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const all = useMemo(() => (q.data ?? []).map(cfg.map), [q.data, cfg]);
  const rows = useSimpleSearch(all, search);
  const phase = queryPhase(q);

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : rows.length === 0
          ? 'empty'
          : 'ready';

  return { q, rows, all, search, setSearch, listState };
}

function Screen({ cfg }: { cfg: Cfg }) {
  const { q, rows, all, search, setSearch, listState } = useSimpleScreen(cfg);
  const ready = listState === 'ready' || listState === 'empty';
  const h = cfg.header?.(q.data ?? [], ready);
  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <SimpleListView
          header={
            h ? (
              <InverseHeader
                eyebrow={h.eyebrow}
                business={cfg.title}
                revenueLabel={h.label}
                revenue={h.value}
                error={!ready}
                onRetry={() => q.refetch()}
                wells={h.wells.map((w, i) => (
                  <StatWell key={i} value={w.value} caption={w.caption} />
                ))}
              />
            ) : undefined
          }
          title={cfg.title}
          phase={listState}
          rows={rows}
          search={search}
          onSearch={setSearch}
          searchPlaceholder={cfg.searchPlaceholder}
          emptyTitle={cfg.emptyTitle}
          emptyHint={cfg.emptyHint}
          errorLabel={`Couldn't load ${cfg.title.toLowerCase()}`}
          onRetry={() => q.refetch()}
          /* "1 discounts" reads as a bug even when the number is right. The
             title is already plural, so singular counts get the singular. */
          sectionLabel={
            search.trim()
              ? `${rows.length} of ${all.length}`
              : `${all.length} ${all.length === 1 ? (cfg.singular ?? cfg.title.toLowerCase()) : cfg.title.toLowerCase()}`
          }
        />
      </div>
    </>
  );
}

const money = (n: unknown) =>
  n === null || n === undefined ? undefined : `$${Number(n).toFixed(2)}`;

/* ── Services ──────────────────────────────────────────────────────────── */
export function ServicesMobileBody() {
  return (
    <Screen
      cfg={{
        title: 'Services',
        header: (rows, ready) => ({
          eyebrow: 'Catalog',
          label: 'Active services',
          value: ready ? String(rows.length) : '—',
          wells: [
            { value: ready ? String(rows.filter((r: any) => r.deposit_amount != null).length) : '—', caption: 'take a deposit' },
          ],
        }),
        singular: 'service',
        table: 'services',
        order: { col: 'name', asc: true },
        emptyTitle: 'No services yet',
        emptyHint: 'Services you offer will show here.',
        searchPlaceholder: 'Search services...',
        map: (s: any): SimpleListRow => ({
          id: s.id,
          title: s.name,
          meta: s.description ? s.description : null,
          lines: [
            s.duration ? `${s.duration} min` : 'No duration set',
            /* A deposit of null is "no deposit required", which is different
               from a deposit of $0.00 — so it says which. */
            s.deposit_amount === null ? null : `Deposit ${money(s.deposit_amount)}`,
          ],
          /* price is NOT nullable in the schema, but a genuine $0.00 exists in
             this product (a free re-clean), so zero is shown as zero. */
          money: money(s.price),
        }),
      }}
    />
  );
}

/* ── Discounts ─────────────────────────────────────────────────────────── */
export function DiscountsMobileBody() {
  return (
    <Screen
      cfg={{
        title: 'Discounts',
        header: (rows, ready) => ({
          eyebrow: 'Promotions',
          label: 'Discount codes',
          value: ready ? String(rows.length) : '—',
          wells: [
            { value: ready ? String(rows.filter((r: any) => r.is_active === true).length) : '—', caption: 'active' },
            { value: ready ? String(rows.filter((r: any) => r.is_active !== true).length) : '—', caption: 'off' },
          ],
        }),
        singular: 'discount',
        table: 'discounts',
        order: { col: 'created_at', asc: false },
        emptyTitle: 'No discounts yet',
        emptyHint: 'Codes you create will show here.',
        searchPlaceholder: 'Search by code...',
        map: (d: any): SimpleListRow => {
          /* Three-state, per the schema. `=== true` so null is not silently
             read as active — the live Switch would show it indeterminate. */
          const active = d.is_active === true;
          const unknownState = d.is_active === null;
          return {
            id: d.id,
            title: d.code ?? 'Untitled code',
            meta: d.description ? d.description : null,
            lines: [
              d.discount_type === 'percentage'
                ? `${d.discount_value}% off`
                : `${money(d.discount_value)} off`,
              d.max_uses === null
                ? 'Unlimited uses'
                : `${d.current_uses ?? 0} of ${d.max_uses} used`,
              d.valid_until
                ? `Expires ${new Date(d.valid_until).toISOString().slice(0, 10)}`
                : 'No expiry',
            ],
            badges: unknownState
              ? [{ tone: 'warn', label: 'State unknown' }]
              : active
                ? [{ tone: 'success', label: 'Active' }]
                : [{ tone: 'info', label: 'Inactive' }],
          };
        },
      }}
    />
  );
}

/* ── Inventory ─────────────────────────────────────────────────────────── */
export function InventoryMobileBody() {
  return (
    <Screen
      cfg={{
        title: 'Inventory',
        header: (rows, ready) => {
          const low = rows.filter((r: any) => r.min_quantity != null && Number(r.quantity) <= Number(r.min_quantity));
          return {
            eyebrow: 'Supplies',
            label: 'Items tracked',
            value: ready ? String(rows.length) : '—',
            /* Low stock leads because it is the only figure here that needs
               an action today. */
            wells: [{ value: ready ? String(low.length) : '—', caption: 'low stock' }],
          };
        },
        singular: 'item',
        table: 'inventory_items',
        order: { col: 'name', asc: true },
        emptyTitle: 'Nothing in inventory',
        emptyHint: 'Supplies you track will show here.',
        searchPlaceholder: 'Search supplies...',
        map: (i: any): SimpleListRow => {
          /* min_quantity is nullable — no reorder threshold set is NOT the
             same as a threshold of zero, so "low stock" is only claimed when
             a threshold actually exists. */
          const hasMin = i.min_quantity !== null && i.min_quantity !== undefined;
          const low = hasMin && Number(i.quantity) <= Number(i.min_quantity);
          return {
            id: i.id,
            title: i.name,
            meta: i.category ? i.category : null,
            lines: [
              /* "1 units" reads as a bug. The unit column is free text, so
                 only the bare count is pluralised, never the unit itself. */
              i.unit
                ? `${i.quantity ?? 0} ${i.unit} in stock`
                : `${i.quantity ?? 0} in stock`,
              hasMin ? `Reorder at ${i.min_quantity}` : 'No reorder level set',
              i.supplier ? i.supplier : null,
            ],
            money: money(i.cost_per_unit),
            badges: low ? [{ tone: 'warn', label: 'Low stock' }] : undefined,
          };
        },
      }}
    />
  );
}

/* ── Checklists ────────────────────────────────────────────────────────── */
export function ChecklistsMobileBody() {
  return (
    <Screen
      cfg={{
        title: 'Checklists',
        header: (rows, ready) => ({
          eyebrow: 'Quality',
          label: 'Checklist templates',
          value: ready ? String(rows.length) : '—',
          wells: [
            { value: ready ? String(rows.filter((r: any) => r.service_id).length) : '—', caption: 'linked to a service' },
          ],
        }),
        singular: 'checklist',
        table: 'checklist_templates',
        order: { col: 'name', asc: true },
        emptyTitle: 'No checklists yet',
        emptyHint: 'Templates you build will show here.',
        searchPlaceholder: 'Search checklists...',
        map: (t: any): SimpleListRow => ({
          id: t.id,
          title: t.name,
          meta: t.description ? t.description : null,
          lines: [t.service_id ? 'Linked to a service' : 'Not linked to a service'],
        }),
      }}
    />
  );
}

/* ── Tasks & notes ─────────────────────────────────────────────────────── */
export function TasksMobileBody() {
  return (
    <Screen
      cfg={{
        title: 'Tasks',
        header: (rows, ready) => ({
          eyebrow: 'Work',
          label: 'Open tasks',
          value: ready ? String(rows.filter((r: any) => r.is_completed !== true).length) : '—',
          wells: [
            { value: ready ? String(rows.filter((r: any) => r.is_completed === true).length) : '—', caption: 'done' },
          ],
        }),
        singular: 'task',
        table: 'tasks_and_notes',
        order: { col: 'created_at', asc: false },
        emptyTitle: 'No tasks yet',
        emptyHint: 'Tasks and notes you add will show here.',
        searchPlaceholder: 'Search tasks and notes...',
        map: (t: any): SimpleListRow => {
          /* When there is no title the content becomes the title — so it must
             not also become the meta line, or every untitled note renders its
             own text twice ("yu | yu"). */
          const hasTitle = !!t.title;
          return {
          id: t.id,
          title: hasTitle ? t.title : (t.content?.slice(0, 60) || 'Untitled note'),
          meta: hasTitle && t.content ? t.content.slice(0, 90) : null,
          lines: [t.due_date ? `Due ${String(t.due_date).slice(0, 10)}` : null],
          badges:
            t.is_completed === true
              ? [{ tone: 'success' as const, label: 'Done' }]
              : [{ tone: 'info' as const, label: 'Open' }],
          };
        },
      }}
    />
  );
}

/* ── Client feedback ───────────────────────────────────────────────────── */
export function FeedbackMobileBody() {
  return (
    <Screen
      cfg={{
        title: 'Feedback',
        header: (rows, ready) => {
          const rated = rows.filter((r: any) => r.rating != null);
          const avg = rated.length ? rated.reduce((s: number, r: any) => s + Number(r.rating), 0) / rated.length : null;
          return {
            eyebrow: 'Clients',
            label: 'Average rating',
            /* Null when nobody has rated — not 0.0, which reads as unanimous
               one-star. */
            value: ready && avg !== null ? avg.toFixed(1) : '—',
            wells: [
              { value: ready ? String(rows.length) : '—', caption: 'responses' },
              { value: ready ? String(rows.filter((r: any) => r.is_resolved !== true).length) : '—', caption: 'unresolved' },
            ],
          };
        },
        singular: 'response',
        table: 'client_feedback',
        order: { col: 'created_at', asc: false },
        emptyTitle: 'No feedback yet',
        emptyHint: 'Ratings and comments from clients will show here.',
        searchPlaceholder: 'Search feedback...',
        map: (fb: any): SimpleListRow => ({
          id: fb.id,
          title:
            fb.rating === null || fb.rating === undefined
              ? 'No rating given'
              : `${'★'.repeat(Number(fb.rating))}${'☆'.repeat(Math.max(0, 5 - Number(fb.rating)))}`,
          meta: fb.issue_description ? fb.issue_description : null,
          lines: [
            fb.resolution ? `Resolution: ${fb.resolution}` : null,
            String(fb.created_at).slice(0, 10),
          ],
          badges: [
            /* Both are nullable in the schema. Null means nobody has decided
               yet, which is not the same as "not resolved". */
            fb.is_resolved === true
              ? { tone: 'success' as const, label: 'Resolved' }
              : fb.is_resolved === false
                ? { tone: 'warn' as const, label: 'Open' }
                : { tone: 'info' as const, label: 'Not triaged' },
            ...(fb.followup_needed === true
              ? [{ tone: 'warn' as const, label: 'Follow-up needed' }]
              : []),
          ],
        }),
      }}
    />
  );
}

/* ── Notifications ─────────────────────────────────────────────────────────
   NOT a list, and not forced into one.

   NotificationsPage reads a single business_settings row for two booleans,
   notify_morning_brief and notify_evening_brief. Rendering that through the
   list view would be dressing a settings screen up as a collection.

   The §5.1 problem here is specific and worse than on a list: a failed read
   of a settings row leaves both toggles OFF, which does not read as "we could
   not check" — it reads as "your briefings are disabled". Someone could sit
   waiting for a morning brief that the screen has quietly told them is
   switched off. So the toggles do not render at all until the read succeeds.
   ────────────────────────────────────────────────────────────────────────── */
export function NotificationsMobileBody() {
  const { organization } = useOrganization();

  const q = useQuery({
    queryKey: ['simple-notification-settings', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from('business_settings')
        .select('notify_morning_brief, notify_evening_brief')
        .eq('organization_id', organization.id)
        /* One row expected, but maybeSingle rather than single: a brand-new
           org has no settings row yet, and "not configured" is a legitimate
           answer that .single() would turn into an error. */
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const phase = queryPhase(q);

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {/* 5b opens with the hero too. The wells report the two briefings as
            three-state, because the columns are nullable and "not set" is not
            "off" — a brand-new org has chosen neither. */}
        <InverseHeader
          eyebrow="Alerts"
          business="Notifications"
          revenueLabel="Daily briefings"
          revenue={
            phase !== 'ready' || !q.data
              ? '—'
              : `${[q.data.notify_morning_brief, q.data.notify_evening_brief].filter(v => v === true).length} of 2 on`
          }
          error={phase === 'error' || phase === 'offline'}
          onRetry={() => q.refetch()}
          wells={
            <>
              <StatWell
                value={phase !== 'ready' || !q.data ? '—' : q.data.notify_morning_brief === true ? 'On' : q.data.notify_morning_brief === false ? 'Off' : 'Not set'}
                caption="morning"
              />
              <StatWell
                value={phase !== 'ready' || !q.data ? '—' : q.data.notify_evening_brief === true ? 'On' : q.data.notify_evening_brief === false ? 'Off' : 'Not set'}
                caption="evening"
              />
            </>
          }
        />
      </div>
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
        {phase === 'error' || phase === 'offline' ? (
          <div className="rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-[18px]">
            <p className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
              Couldn&rsquo;t load your notification settings
            </p>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              Nothing is shown rather than shown wrong. Two switches rendered
              off would say your briefings are disabled, and we don&rsquo;t know
              that.
            </p>
            <button
              type="button"
              onClick={() => q.refetch()}
              className="mt-2.5 text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
            >
              Try again
            </button>
          </div>
        ) : phase === 'loading' ? (
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
            Loading settings…
          </p>
        ) : !q.data ? (
          <div className="rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-[18px]">
            <p className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
              Not set up yet
            </p>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              This organisation has no notification settings saved. Briefings
              are off until you turn them on.
            </p>
          </div>
        ) : (
          <div className="rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-[18px]">
            <p className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
              Daily briefings
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {([
                ['Morning brief', q.data!.notify_morning_brief],
                ['Evening brief', q.data!.notify_evening_brief],
              ] as [string, boolean | null][]).map(([label, v]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                    {label}
                  </span>
                  {/* Three-state again: the column is nullable, and null means
                      never chosen rather than chosen-off. */}
                  <span
                    className={
                      'shrink-0 text-[11.5px] font-bold ' +
                      (v === true
                        ? 'text-[hsl(var(--pv-success))]'
                        : v === false
                          ? 'text-[hsl(var(--pv-ink-3))]'
                          : 'text-[hsl(var(--pv-warn))]')
                    }
                  >
                    {v === true ? 'On' : v === false ? 'Off' : 'Not set'}
                  </span>
                </div>
              ))}
            </div>
          </div>
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


export function ServicesWiredPage() {
  return (
    <AdminLayout title="Services" subtitle="Mobile layout, live data">
      <ServicesMobileBody />
    </AdminLayout>
  );
}

export function DiscountsWiredPage() {
  return (
    <AdminLayout title="Discounts" subtitle="Mobile layout, live data">
      <DiscountsMobileBody />
    </AdminLayout>
  );
}

export function InventoryWiredPage() {
  return (
    <AdminLayout title="Inventory" subtitle="Mobile layout, live data">
      <InventoryMobileBody />
    </AdminLayout>
  );
}

export function ChecklistsWiredPage() {
  return (
    <AdminLayout title="Checklists" subtitle="Mobile layout, live data">
      <ChecklistsMobileBody />
    </AdminLayout>
  );
}

export function TasksWiredPage() {
  return (
    <AdminLayout title="Tasks" subtitle="Mobile layout, live data">
      <TasksMobileBody />
    </AdminLayout>
  );
}

export function FeedbackWiredPage() {
  return (
    <AdminLayout title="Feedback" subtitle="Mobile layout, live data">
      <FeedbackMobileBody />
    </AdminLayout>
  );
}

export function NotificationsWiredPage() {
  return (
    <AdminLayout title="Notifications" subtitle="Mobile layout, live data">
      <NotificationsMobileBody />
    </AdminLayout>
  );
}
