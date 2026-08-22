import { useMemo, type ReactNode } from 'react';
import { ListShell, ListSectionLabel, type ListState } from './ListShell';
import { ActionChipRow, type ActionChip } from './ActionChipRow';
import { ListRow } from './ListRow';

/**
 * The shared list for the screens that are genuinely the same shape:
 * checklists, inventory, tasks, notifications, discounts, services, client
 * feedback and the settings sections.
 *
 * They are batched because they ARE one shape — a titled row with supporting
 * lines, an optional badge and an optional figure. Anything that needed more
 * than that (bookings, customers, leads, and the money screens) has its own
 * view instead. Per-screen specifics live in each page's mapping function,
 * which is where the nulls and the slugs actually differ.
 *
 * No queries here.
 */

export type SimpleListRow = {
  id: string;
  title: string;
  /** One line under the title. */
  meta?: string | null;
  /** Further lines, each on its own row — never packed onto one. */
  lines?: (string | null)[];
  /** Pre-formatted. Pass undefined for "no figure", never "$0.00". */
  money?: string;
  badges?: { tone: 'success' | 'info' | 'warn' | 'danger'; label: string }[];
  /** Inline row actions — 8a's Mark Paid / Resend / View · Duplicate. */
  actions?: { id: string; label: string; onClick: () => void; tone?: 'primary' | 'plain' }[];
  /** 7f / 11a's left status bar. */
  accent?: 'success' | 'warn' | 'danger' | 'brand';
  /** 11a's per-row active toggle. */
  toggle?: { checked: boolean; onChange: (next: boolean) => void; label: string };
  /** Bulk-selection checkbox. */
  select?: { checked: boolean; onChange: (next: boolean) => void; label: string };
};

export function SimpleListView({
  title,
  phase,
  rows,
  search,
  onSearch,
  searchPlaceholder,
  emptyTitle,
  emptyHint,
  errorLabel,
  onRetry,
  onSelect,
  addLabel,
  sectionLabel,
  note,
  header,
  actions,
  onAdd,
  onFilter,
  filterCount,
  badgeAlign,
  hideTitle,
  hideSearch,
  hideTabs,
  hideSectionLabel,
  beforeList,
}: {
  title: string;
  phase: ListState;
  rows: SimpleListRow[];
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  emptyTitle: string;
  emptyHint: string;
  errorLabel: string;
  onRetry?: () => void;
  onSelect?: (r: SimpleListRow) => void;
  addLabel?: string;
  sectionLabel?: string;
  /** A caveat that belongs above the rows, e.g. a companion read that failed. */
  note?: string;
  /* ── Added when the wiring pass met the mockups ────────────────────────
     Most comps in this set open with an InverseHeader — a dark hero carrying
     the screen's headline figure and two or three StatWells — above the list
     rather than inside it. It is a page header, not list content, so it
     renders BEFORE ListShell and is not affected by the list's state.

     Optional, so the states previews and any caller that does not want one
     are unchanged. */
  header?: ReactNode;
  /* ── Added when the live screens' toolbars moved onto phones ───────────
     A comp gives a list screen one action. The live admin screens have two
     to four, and swapping the phone layout in without them would delete
     those actions from phones entirely. They render as chips between the
     header and the rows. Optional throughout. */
  actions?: ActionChip[];
  /** Wires the shell's "+ Add" button to the live page's real dialog. */
  onAdd?: () => void;
  /** Compound controls (selects, ranges) that do not fit in a chip row. */
  onFilter?: () => void;
  filterCount?: number;
  /** 7f / 10c right-align their status pills; 4c does not. */
  badgeAlign?: 'left' | 'right';
  /* Comps 6a / 8a / 10g carry the title, search and tabs in the hero, so the
     shell must not render a second set. */
  hideTitle?: boolean;
  hideSearch?: boolean;
  hideTabs?: boolean;
  hideSectionLabel?: boolean;
  /** Content between the header and the list (6a's month calendar). */
  beforeList?: ReactNode;
}) {
  const filtered = search.trim().length > 0;

  return (
    <>
      {header}

      {/* Outside ListShell on purpose. The shell renders children only when
          state === 'ready', so a chip row inside it disappears on an empty,
          loading or failed list — taking "Add" with it at exactly the moment
          someone needs it. */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-1.5 pt-1">
          <ActionChipRow actions={actions} label={`${title} actions`} />
        </div>
      )}

      {beforeList}

      <ListShell<'all'>
      title={title}
      hideTitle={hideTitle}
      hideSearch={hideSearch}
      hideTabs={hideTabs}
      action={{ label: addLabel ?? 'Add', onClick: onAdd }}
      onFilter={onFilter}
      filterCount={filterCount ?? 0}
      search={search}
      onSearch={onSearch}
      searchPlaceholder={searchPlaceholder ?? 'Search...'}
      tabs={[{ id: 'all', label: `All ${title.toLowerCase()}`, count: rows.length }]}
      tab="all"
      onTab={() => undefined}
      state={phase}
      empty={
        filtered
          ? {
              title: 'Nothing matches that',
              hint: 'Try a different search.',
              action: { label: 'Clear search', onClick: () => onSearch('') },
            }
          : { title: emptyTitle, hint: emptyHint, action: { label: addLabel ?? 'Add', onClick: onAdd } }
      }
      errorLabel={errorLabel}
      onRetry={onRetry}
      skeletonRows={5}
    >
      {!hideSectionLabel && (
        <ListSectionLabel>{sectionLabel ?? `${rows.length} items`}</ListSectionLabel>
      )}
      {note && (
        <p className="mx-4 mb-2 rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
          {note}
        </p>
      )}
      {rows.map(r => (
        <ListRow
          key={r.id}
          title={r.title}
          meta={r.meta ?? undefined}
          lines={(r.lines ?? []).filter((l): l is string => !!l)}
          money={r.money}
          status={r.badges}
          actions={r.actions}
          accent={r.accent}
          toggle={r.toggle}
          select={r.select}
          badgeAlign={badgeAlign}
          onClick={onSelect ? () => onSelect(r) : undefined}
        />
      ))}
      </ListShell>
    </>
  );
}

export function useSimpleSearch(all: SimpleListRow[], search: string) {
  return useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      r =>
        r.title.toLowerCase().includes(q) ||
        (r.meta ?? '').toLowerCase().includes(q) ||
        (r.lines ?? []).some(l => (l ?? '').toLowerCase().includes(q)),
    );
  }, [all, search]);
}
