import { Search, Plus, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { Card, Skeleton } from './Card';
import { Button } from './Button';
import { SegmentedTabs } from './SegmentedTabs';

/**
 * The shell ten admin list screens share: header, search, optional filter,
 * optional tabs, the list, and §5.1's states — written ONCE so ten screens
 * inherit a correct version instead of ten near-misses.
 *
 * §5.1 is the reason this exists at all. Three bugs in one week rendered a
 * FAILURE as an EMPTY RESULT, and a list screen is exactly where that happens:
 * `rows.length === 0` is true while loading, while failed, and when genuinely
 * empty. So `state` is an explicit union here — there is no way to render this
 * shell without having decided which of the three you are in.
 *
 * Two §5.1 rules are structural rather than advisory:
 *   - empty and error are never the same component and never the same words
 *   - error keeps the screen alive: the header, its action, the search box and
 *     the tabs all stay usable, because the failure was the list, not the page
 */
export type ListState = 'ready' | 'loading' | 'empty' | 'error';

export function ListShell<T extends string>({
  title,
  action,
  search,
  onSearch,
  searchPlaceholder = 'Search',
  onFilter,
  filterCount = 0,
  merge,
  tabs,
  tab,
  onTab,
  state,
  empty,
  errorLabel = "Couldn't load this list",
  onRetry,
  skeletonRows = 4,
  hideTitle = false,
  hideSearch = false,
  hideTabs = false,
  children,
}: {
  title: string;
  action?: { label: string; onClick?: () => void };
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  onFilter?: () => void;
  filterCount?: number;
  /* Comp 7g: an inline "⇅ Merge" control beside the search box, distinct
     from onFilter (a panel) and from a row action — it opens the app's
     real duplicate-merge flow. Optional so every other ListShell caller is
     unaffected. */
  merge?: { label?: string; onClick: () => void };
  tabs?: { id: T; label: string; count?: number }[];
  tab?: T;
  onTab?: (id: T) => void;
  state: ListState;
  /** Shown ONLY when a request completed, succeeded and returned no rows. */
  empty: { title: string; hint?: string; action?: { label: string; onClick?: () => void } };
  errorLabel?: string;
  onRetry?: () => void;
  skeletonRows?: number;
  /* Set when the page's hero already carries the title / search / tabs, so
     the shell does not render a second copy of the same control. */
  hideTitle?: boolean;
  hideSearch?: boolean;
  hideTabs?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {!hideTitle && (
      <div className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-[19px] font-extrabold text-[hsl(var(--pv-ink))]">
          {title}
        </h1>
        {action && (
          <Button
            variant="primary"
            onClick={action.onClick}
            icon={<Plus className="h-4 w-4" aria-hidden />}
          >
            {action.label}
          </Button>
        )}
      </div>
      )}

      {/* Search and filter stay live in every state, including error. */}
      {!hideSearch && (
      <div className="flex gap-2">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3">
          <Search className="h-4 w-4 shrink-0 text-[hsl(var(--pv-ink-3))]" aria-hidden />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none"
          />
        </label>
        {merge && (
          <button
            type="button"
            onClick={merge.onClick}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 text-[11px] font-bold text-[hsl(var(--pv-ink))] transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
          >
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
            {merge.label ?? 'Merge'}
          </button>
        )}
        {onFilter && (
          <button
            type="button"
            onClick={onFilter}
            aria-label={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))] transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {filterCount > 0 && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[hsl(var(--pv-brand))] px-1 text-[10px] font-extrabold tabular-nums text-[hsl(var(--pv-brand-ink))]"
              >
                {filterCount}
              </span>
            )}
          </button>
        )}
      </div>
      )}

      {!hideTabs && tabs && tab && onTab && (
        <SegmentedTabs tabs={tabs} value={tab} onChange={onTab} label={`${title} filter`} />
      )}

      {state === 'loading' && (
        <Card>
          <div className="flex flex-col gap-3.5">
            {Array.from({ length: skeletonRows }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-[46px] rounded-[8px]" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="mt-1.5 h-2.5 w-1/3" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Genuinely no rows. Never reached from a failure. */}
      {state === 'empty' && (
        <Card>
          <div className="py-4 text-center">
            <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">{empty.title}</p>
            {empty.hint && (
              <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                {empty.hint}
              </p>
            )}
            {empty.action && (
              <button
                type="button"
                onClick={empty.action.onClick}
                className="mt-2 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                {empty.action.label}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* A failure. Different component, different words, never the empty copy. */}
      {state === 'error' && (
        <Card>
          <div role="alert">
            <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">{errorLabel}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        </Card>
      )}

      {/* No outer card: mockup 4c stacks each row as its own card with 10px
          gaps. ListRow carries the card now. */}
      {state === 'ready' && <div className="flex flex-col gap-2.5">{children}</div>}
    </div>
  );
}

/** Re-exported so a screen can label its own section inside the list. */
export function ListSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1 pt-2 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
      {children}
    </p>
  );
}
