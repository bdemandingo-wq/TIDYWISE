import { useMemo } from 'react';
import { ListShell, ListSectionLabel, type ListState } from './ListShell';
import { ActionChipRow, type ActionChip } from './ActionChipRow';
import { ListRow } from './ListRow';
import { leadStatusBadge, leadSourceLabel } from '@/lib/leadStatus';

/** The admin leads list, presentation only. No queries. */

export type LeadsRow = {
  id: string;
  /** Collapsed by leadDisplayName — leads.name carries doubled spaces. */
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Raw slug in; labelled here. Never rendered raw. */
  source: string | null;
  status: string | null;
  serviceInterest: string | null;
  /** Null on every live row, so it renders only when there genuinely is one. */
  estimatedValue: number | null;
  createdLabel: string;
  hasMessage: boolean;
};

export function LeadsListView({
  phase,
  rows,
  search,
  onSearch,
  onSelect,
  onRetry,
  sectionLabel,
  actions,
  onAdd,
  onFilter,
  filterCount,
}: {
  phase: ListState;
  rows: LeadsRow[];
  search: string;
  onSearch: (v: string) => void;
  onSelect?: (r: LeadsRow) => void;
  onRetry?: () => void;
  sectionLabel?: string;
  actions?: ActionChip[];
  onAdd?: () => void;
  /** Status / source / month, which do not fit in a chip row. */
  onFilter?: () => void;
  filterCount?: number;
}) {
  const filtered = search.trim().length > 0;

  return (
    <>
      {/* Outside ListShell — the shell renders children only when
          state === 'ready', so actions inside it vanish on an empty or
          failed list. */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-1.5 pt-1">
          <ActionChipRow actions={actions} label="Lead actions" />
        </div>
      )}

    <ListShell<'all'>
      title="Leads"
      action={{ label: 'Add', onClick: onAdd }}
      onFilter={onFilter}
      filterCount={filterCount ?? 0}
      search={search}
      onSearch={onSearch}
      searchPlaceholder="Search by name, email, phone, or source..."
      tabs={[{ id: 'all', label: 'All leads', count: rows.length }]}
      tab="all"
      onTab={() => undefined}
      state={phase}
      empty={
        filtered
          ? {
              title: 'No leads match that',
              hint: 'Try another name, email, or source.',
              action: { label: 'Clear search', onClick: () => onSearch('') },
            }
          : {
              title: 'No leads yet',
              hint: 'Enquiries from your site, and ones you add by hand, will show here.',
              action: { label: 'Add lead' },
            }
      }
      errorLabel="Couldn't load leads"
      onRetry={onRetry}
      skeletonRows={6}
    >
      <ListSectionLabel>{sectionLabel ?? `${rows.length} leads`}</ListSectionLabel>
      {rows.map(r => (
        <ListRow
          key={r.id}
          title={r.name ?? 'Unnamed lead'}
          meta={r.email ?? 'No email'}
          lines={[
            r.phone ?? 'No phone',
            /* Labelled, never the slug. 83% of live rows are customer_import,
               which the live table prints as "Customer_import". */
            leadSourceLabel(r.source),
            r.serviceInterest
              ? r.serviceInterest
              : r.hasMessage
                ? 'Left a message'
                : `Added ${r.createdLabel}`,
          ]}
          /* estimated_value is null on every live lead, so a figure appears
             only when one was actually set — never a fabricated $0.00 that
             would read as a lead worth nothing. */
          money={r.estimatedValue === null ? undefined : `$${r.estimatedValue.toFixed(2)}`}
          status={[leadStatusBadge(r.status)]}
          onClick={onSelect ? () => onSelect(r) : undefined}
        />
      ))}
    </ListShell>
    </>
  );
}

export function matchesLeadSearch(r: LeadsRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    (r.name ?? '').toLowerCase().includes(s) ||
    (r.email ?? '').toLowerCase().includes(s) ||
    (r.phone ?? '').toLowerCase().includes(s) ||
    /* Searchable by the LABEL a user can see, not the slug they cannot. */
    leadSourceLabel(r.source).toLowerCase().includes(s)
  );
}

export function useLeadSearch(all: LeadsRow[], search: string) {
  return useMemo(() => all.filter(r => matchesLeadSearch(r, search)), [all, search]);
}
