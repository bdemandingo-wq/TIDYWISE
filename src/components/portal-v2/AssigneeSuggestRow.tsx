import { Avatar } from './Avatar';

/**
 * §2 (1c): avatar + name + "suggested" + Change link.
 *
 * §5.1: empty is "No suggestion" + Change; error is "Couldn't load cleaners" +
 * Retry — and the step must stay completable by picking manually either way, so
 * Change is rendered in all three states rather than being swallowed by the
 * error branch.
 */
export function AssigneeSuggestRow({
  name,
  state = 'ready',
  onChange,
  onRetry,
}: {
  name?: string;
  state?: 'ready' | 'empty' | 'error';
  onChange?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3 py-2"
      {...(state === 'error' ? { role: 'alert' } : {})}
    >
      {state === 'ready' && name ? (
        <Avatar name={name} className="h-8 w-8 text-[11px]" />
      ) : (
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full border border-dashed border-[hsl(var(--pv-border-strong))]"
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">
          {state === 'ready' ? name : state === 'empty' ? 'No suggestion' : "Couldn't load cleaners"}
        </p>
        {state === 'ready' && (
          <p className="text-[11px] font-medium text-[hsl(var(--pv-ink-3))]">Suggested</p>
        )}
      </div>

      {state === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
        >
          Retry
        </button>
      )}
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
      >
        Change
      </button>
    </div>
  );
}
