import { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OrgSwitcherItem {
  id: string;
  name: string;
  /** Secondary line — the org role on the admin side, the staff role on the portal. */
  subtitle?: string;
}

interface Props {
  items: OrgSwitcherItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  heading?: string;
  /**
   * Blocks selection while a write is in flight. `switchOrganization` calls
   * `queryClient.clear()`, and although that cannot lose an in-flight write
   * (mutationCache.clear() removes mutations without cancelling them, and the
   * staff portal's clock-in / photo upload are plain async outside react-query),
   * it does unmount the job list mid-action. Disabling is cheaper than letting
   * a cleaner watch their screen reset one tap after clocking in.
   */
  disabled?: boolean;
  /** Trailing per-row control — the admin sidebar's owner-only delete button. */
  itemAction?: (item: OrgSwitcherItem) => ReactNode;
  classes?: {
    wrapper?: string;
    heading?: string;
    row?: string;
    rowActive?: string;
    rowInactive?: string;
    avatar?: string;
    name?: string;
    subtitle?: string;
    check?: string;
  };
}

/**
 * The "switch business" list, shared by the admin sidebar and the staff portal.
 *
 * Lifted verbatim out of AdminSidebar so the two surfaces cannot drift. The
 * defaults below reproduce the sidebar's original markup exactly; the staff
 * portal overrides them with its own portal-v2 (--pv-*) tokens, because that
 * surface has a different palette and the sidebar classes render nearly
 * invisible on it.
 *
 * Deliberately presentational: it does not read OrganizationContext or decide
 * what "active" means. The staff portal's active org is its staff row's org,
 * which is NOT always the context's org — see useMyStaffOrgs.
 */
export function OrgSwitcherList({
  items,
  activeId,
  onSelect,
  heading = 'Your Businesses',
  disabled = false,
  itemAction,
  classes,
}: Props) {
  // Nothing to switch between — render nothing at all rather than a control
  // that does nothing. Most cleaners work for one business.
  if (items.length <= 1) return null;

  return (
    <div className={classes?.wrapper ?? 'pb-2 mb-2 border-b border-sidebar-border space-y-0.5'}>
      <p
        className={
          classes?.heading ??
          'px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 mb-1'
        }
      >
        {heading}
      </p>
      {items.map((item) => {
        const isActive = item.id === activeId;
        const initials = item.name.substring(0, 2).toUpperCase();
        return (
          <div
            key={item.id}
            className={cn(
              classes?.row ?? 'group w-full flex items-center gap-2 pr-1 rounded-lg transition-colors',
              isActive
                ? classes?.rowActive ?? 'bg-sidebar-accent text-sidebar-foreground'
                : classes?.rowInactive ??
                    'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent',
              disabled && !isActive && 'opacity-50 pointer-events-none'
            )}
          >
            <button
              type="button"
              onClick={() => {
                if (!isActive && !disabled) onSelect(item.id);
              }}
              disabled={disabled && !isActive}
              aria-current={isActive ? 'true' : undefined}
              // min-h-[44px] is the iOS touch target floor — this list is used
              // inside the native app, where a shorter row is hard to hit.
              className="flex-1 flex items-center gap-3 pl-3 py-2 rounded-lg min-h-[44px] pointer-events-auto touch-manipulation text-left"
            >
              <div
                className={
                  classes?.avatar ??
                  'w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0'
                }
              >
                {initials}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className={classes?.name ?? 'text-sm font-medium truncate'}>{item.name}</p>
                {item.subtitle && (
                  <p className={classes?.subtitle ?? 'text-[10px] text-sidebar-foreground/50'}>
                    {item.subtitle}
                  </p>
                )}
              </div>
              {isActive && (
                <Check className={classes?.check ?? 'w-4 h-4 text-primary flex-shrink-0'} />
              )}
            </button>
            {itemAction?.(item)}
          </div>
        );
      })}
    </div>
  );
}
