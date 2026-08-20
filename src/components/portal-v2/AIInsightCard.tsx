import { Sparkles } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

/**
 * §2 (1b). First use of accent.ai, and the constraint from §1.1b is load-bearing:
 * indigo is an ICON, RAIL and BORDER colour, never text. It clears 4.5:1 on
 * --pv-surface alone and misses every other surface in both themes — including
 * aiTint, its own card background.
 *
 * So: the icon square is accent.ai, the border is aiBorder, and the copy is
 * --pv-ink-2 (text.body). The action link is the one place the spec puts indigo
 * on text — kept at a link's weight and size, on the card rather than the tint,
 * where it measures 4.86:1.
 *
 * §5.1: the card is OMITTED entirely when there is no insight — "no insight is
 * not a state worth a slot". On failure it renders with "Insights unavailable"
 * and NO Urgent chip.
 */
export function AIInsightCard({
  title,
  body,
  urgent = false,
  actionLabel,
  onAction,
  error = false,
}: {
  title: string;
  body: string;
  urgent?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  error?: boolean;
}) {
  return (
    <section className="rounded-[16px] border border-[hsl(var(--pv-ai-border))] bg-[hsl(var(--pv-ai-soft))] px-[18px] py-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[hsl(var(--pv-ai))]"
        >
          <Sparkles className="h-4 w-4 text-[hsl(var(--pv-brand-ink))]" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
          {error ? 'Insights unavailable' : title}
        </h2>
        {urgent && !error && (
          <span className="shrink-0">
            <StatusBadge tone="danger" label="Urgent" />
          </span>
        )}
      </div>

      <p className="mt-2.5 text-[12.5px] font-semibold leading-[1.52] text-[hsl(var(--pv-ink-2))]">
        {error
          ? "We couldn't read your insights just now. Your numbers are unaffected."
          : body}
      </p>

      {!error && actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 text-[11.5px] font-bold text-[hsl(var(--pv-ai))] underline-offset-2 hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </section>
  );
}
