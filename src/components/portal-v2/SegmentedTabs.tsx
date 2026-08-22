import { cn } from '@/lib/utils';

/**
 * §2 (2a): pill row, active solid primary, counts inline. §3 rule 14: >= 44px.
 *
 * Deliberately NOT role="tab". Two reasons, and they agree:
 *
 * 1. Semantics. role="tab" is a contract with role="tabpanel" — it promises
 *    swapping panels. This filters one list in place, so a group of toggle
 *    buttons with aria-pressed is the honest description of what it does.
 * 2. Collision. src/index.css:1296 styles `.portal-v2 [role="tab"]` with
 *    `background: transparent !important; border: 0 !important` for the shadcn
 *    Tabs component, and that selector out-specifies a utility class. Anything
 *    here carrying role="tab" silently renders flat and grey — the pill and the
 *    active fill both vanish, with no error.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    /* Wraps rather than scrolls. Four tabs with the comps' own words
       ("Automations · Messages · Health · Suggestions") do not fit one
       390px line, and a horizontal scroll hides the last one behind a
       barely-visible bar — the exact failure that made the settings tab
       strip unusable at this width. Wrapping keeps every label intact and
       every destination visible, which the comp cares about more than the
       row count. */
    <div
      role="group"
      aria-label={label}
      /* Scrolls, does not wrap. Both 4c and 7g put every tab on one row;
         flex-wrap dropped Bookings' fourth tab onto a second line, which
         pushed the whole list down a row on the screen with the most tabs.
         The items already carry shrink-0, so scrolling cannot truncate a
         label — the same rule the action chips follow. */
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5',
              'text-[12.5px] font-bold transition-colors duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]',
              active
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-3))]',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={cn(
                  'tabular-nums',
                  active
                    ? 'text-[hsl(var(--pv-brand-ink))]'
                    : 'text-[hsl(var(--pv-ink-4))]',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
