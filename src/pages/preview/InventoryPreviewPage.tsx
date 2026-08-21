import { useMemo, useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, StatusBadge, type ListState } from '@/components/portal-v2';

/**
 * Screen 11b — Inventory.
 *
 * Preview route only, static data. Additive.
 *
 * ── The comp ships EMPTY, and that is the interesting part ────────────
 *
 * 11b's ready state is "📦 No inventory items found — Track supplies,
 * equipment, chemicals and uniforms with low-stock alerts. + Add your
 * first item". The org in the comp has never used this feature, so the
 * empty state is the screen most people will actually see, and it does
 * three things at once: names the four categories, names the payoff
 * (low-stock alerts), and offers the first action. Carried verbatim.
 *
 * Most empty states in this app say what is missing. This one says what
 * the feature is FOR, which is the right move when the emptiness is
 * because nobody has started rather than because something was deleted.
 *
 * ── Low stock is a state, not a filter ────────────────────────────────
 *
 * "Low Stock" sits in the same row as Supplies / Equipment / Chemicals,
 * but it is not a category — it cuts across all of them. Keeping it first
 * in the row matches the comp and matches its use: it is the tab you open
 * when you are about to order, and the only one with a deadline attached.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A quantity that could not be read renders "—" and the row does NOT get a
 * low-stock badge. Badging an unknown quantity as low would send someone
 * shopping for something they already have; leaving it unbadged when it
 * genuinely is low is the safer of the two errors here, and the row still
 * says its count is unreadable.
 */

type Tab = 'all' | 'low' | 'supplies' | 'equipment' | 'chemicals';
type Item = {
  id: string;
  name: string;
  category: 'supplies' | 'equipment' | 'chemicals' | 'uniforms';
  qty: number | null;
  threshold: number;
  unit: string;
};

const ITEMS: Item[] = [
  { id: '1', name: 'Microfibre cloths', category: 'supplies', qty: 240, threshold: 100, unit: 'cloths' },
  { id: '2', name: 'All-purpose cleaner', category: 'chemicals', qty: 6, threshold: 12, unit: 'bottles' },
  { id: '3', name: 'Vacuum bags', category: 'supplies', qty: 8, threshold: 20, unit: 'bags' },
  { id: '4', name: 'Floor machine pads', category: 'equipment', qty: 14, threshold: 6, unit: 'pads' },
  { id: '5', name: 'Branded polos', category: 'uniforms', qty: null, threshold: 10, unit: 'shirts' },
];

const STATES: { id: ListState | 'fresh'; label: string; why: string }[] = [
  { id: 'fresh', label: 'Never used', why: "The comp's own ready state. It names the categories, the payoff, and the first action." },
  { id: 'ready', label: 'Stocked', why: 'Two items under threshold. Low stock cuts across categories rather than being one.' },
  { id: 'error', label: 'Error', why: 'Quantities render "—" and low-stock badges are SUPPRESSED, not guessed.' },
];

export default function InventoryPreviewPage() {
  const [state, setState] = useState<ListState | 'fresh'>('fresh');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const errored = state === 'error';
  const fresh = state === 'fresh';

  const isLow = (i: Item) => i.qty !== null && i.qty < i.threshold;

  const rows = useMemo(() => {
    if (fresh) return [];
    const q = search.trim().toLowerCase();
    return ITEMS.filter(i => {
      const matchesSearch = !q || i.name.toLowerCase().includes(q);
      const matchesTab =
        tab === 'all' ||
        (tab === 'low' ? isLow(i) : i.category === tab);
      return matchesSearch && matchesTab;
    });
  }, [fresh, search, tab]);

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: fresh ? 0 : ITEMS.length },
    /* First in the row, because it is the tab you open before ordering. */
    { id: 'low', label: 'Low Stock', count: fresh || errored ? 0 : ITEMS.filter(isLow).length },
    { id: 'supplies', label: 'Supplies' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'chemicals', label: 'Chemicals' },
  ];

  const shellState: ListState = errored ? 'error' : rows.length === 0 ? 'empty' : 'ready';

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {STATES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setState(s.id)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (state === s.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {s.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Inventory"
          action={{ label: 'Add item' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search items…"
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={shellState}
          empty={
            fresh
              ? {
                  /* Verbatim. Says what the feature is FOR, not what is
                     missing — right when the emptiness is because nobody
                     has started rather than because something was deleted. */
                  title: 'No inventory items found',
                  hint: 'Track supplies, equipment, chemicals and uniforms with low-stock alerts.',
                  action: { label: 'Add your first item' },
                }
              : {
                  title: 'Nothing matches that',
                  hint: 'Try another name, or a different category.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
          }
          errorLabel="Couldn't load inventory"
          onRetry={() => setState('ready')}
          skeletonRows={5}
        >
          <ListSectionLabel>{rows.length} items</ListSectionLabel>
          {rows.map(i => (
            <ListRow
              key={i.id}
              title={i.name}
              meta={i.category[0].toUpperCase() + i.category.slice(1)}
              lines={[
                i.qty === null
                  ? 'Quantity unreadable'
                  : `${i.qty} ${i.unit} · reorder under ${i.threshold}`,
              ]}
              /* Never badge an unknown quantity as low — that sends someone
                 shopping for something they already have. */
              status={isLow(i) ? [{ tone: 'warn', label: 'Low stock' }] : undefined}
              onClick={() => undefined}
            />
          ))}
        </ListShell>
      </div>
    </div>
  );
}
