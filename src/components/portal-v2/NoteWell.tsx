import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * §3 rule 7: tinted wells encode source. amber = human-written and must-read;
 * primaryTint = structured data. Same family, same meaning, everywhere.
 *
 * §5 long content: clamps at 4 lines with More.
 */
export function NoteWell({
  tone,
  label,
  children,
}: {
  /* 11c pairs a danger alert (negative margin) with a warn one (1099
     filing) in the same stack, so danger is a real third tone here. */
  tone: 'warn' | 'info' | 'danger';
  label: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  /* Only offer More when the text is actually cut off. Showing it
     unconditionally makes a two-line note look like it is hiding something. */
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [children]);

  return (
    <div
      className={cn(
        /* 11c: radius 14px, padding 12/16. */
        'rounded-[14px] border px-4 py-3',
        tone === 'warn'
          ? 'border-[hsl(var(--pv-warn-soft))] bg-[hsl(var(--pv-warn-soft))]'
          : tone === 'danger'
            ? 'border-[hsl(var(--pv-danger-soft))] bg-[hsl(var(--pv-danger-soft))]'
            : 'border-[hsl(var(--pv-brand-soft))] bg-[hsl(var(--pv-brand-soft))]',
      )}
    >
      {/* 11c renders this at 12px/800 in the tone's own ink, sentence case.
          Eyebrow uppercases, and the comps contain no uppercase anywhere. */}
      <p
        className={cn(
          'text-[12px] font-extrabold',
          tone === 'warn'
            ? 'text-[hsl(var(--pv-warn))]'
            : tone === 'danger'
              ? 'text-[hsl(var(--pv-danger))]'
              : 'text-[hsl(var(--pv-brand))]',
        )}
      >
        {label}
      </p>
      <p
        ref={bodyRef}
        className={cn(
          /* 11c: 11.5px, line-height 1.5, 3px below the title. */
          'mt-[3px] text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]',
          !expanded && 'line-clamp-4',
        )}
      >
        {children}
      </p>
      {!expanded && clamped && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
        >
          More
        </button>
      )}
    </div>
  );
}

/**
 * §5.1: a note well that failed to load renders in WARN tone with an explicit
 * failure, never as an absent well. "Missing safety instructions must never
 * look like no instructions." An empty well is omitted by the caller instead.
 */
export function NoteWellError({
  label,
  message,
  onRetry,
}: {
  label: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-[hsl(var(--pv-warn))] bg-[hsl(var(--pv-warn-soft))] px-3 py-2.5"
    >
      <p className="text-[12px] font-extrabold text-[hsl(var(--pv-warn))]">{label}</p>
      <p className="mt-1 text-[12.5px] font-semibold leading-[1.52] text-[hsl(var(--pv-ink-2))]">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
