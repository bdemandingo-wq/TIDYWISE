import type { ReactNode } from 'react';

/**
 * A horizontally scrollable row of screen-level actions.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 *
 * The mockups give a list screen ONE action — the "+ Add" in the header.
 * The live admin screens have four or five: Export, Bulk Edit, Import,
 * Merge, and so on. Swapping the phone layout to the comp-matched body
 * would have deleted them from phones, so they land here instead of
 * disappearing.
 *
 * They are chips rather than buttons because a phone is 390px wide and
 * five buttons do not fit. Scrolling sideways keeps every action reachable
 * without stacking them into a wall that pushes the list below the fold —
 * the thing that made the doubled chrome unreadable in the first place.
 *
 * ── Truncation is the failure mode to avoid ───────────────────────────
 *
 * Each chip sits on `shrink-0` and the row scrolls. A chip that shrank to
 * fit would read "Notify Week's…", and a half-named destructive action is
 * worse than one the user has to scroll to. Labels stay whole.
 *
 * `busy` is separate from `disabled` on purpose. A disabled chip is one
 * that cannot run; a busy chip is one already running. Collapsing them
 * loses the difference between "you can't" and "wait".
 */

export type ActionChip = {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** 'danger' for destructive actions; they still need a confirm upstream. */
  tone?: 'default' | 'primary' | 'danger';
};

export function ActionChipRow({
  actions,
  label,
}: {
  actions: ActionChip[];
  /** Screen-reader name for the group, e.g. "Booking actions". */
  label?: string;
}) {
  const shown = actions.filter(Boolean);
  if (shown.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {shown.map(a => {
        const off = a.disabled || a.busy;
        const tone =
          a.tone === 'primary'
            ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
            : a.tone === 'danger'
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-brand-ink))]'
              : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))]';
        return (
          <button
            key={a.id}
            type="button"
            onClick={a.onClick}
            disabled={off}
            aria-busy={a.busy || undefined}
            className={
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--pv-border))] ' +
              'px-3.5 py-2 text-[12.5px] font-bold ' +
              tone +
              (off ? ' opacity-50' : ' active:opacity-80')
            }
          >
            {a.busy ? (
              <span
                aria-hidden
                className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
              />
            ) : (
              a.icon
            )}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
