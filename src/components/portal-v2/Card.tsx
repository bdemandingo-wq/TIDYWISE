import { cn } from '@/lib/utils';

/**
 * Flat card. §3 rule 10: no shadow — the border does the work.
 * radius.xl (16), card padding space.4 space.4_5 (16px / 18px).
 */
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'rounded-[16px] border border-[hsl(var(--pv-border))]',
        'bg-[hsl(var(--pv-surface))] px-[18px] py-4',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/**
 * The spotlight surface — max once per screen (§3 rule 2).
 *
 * In light mode the fill alone separates it: navy is several steps darker than
 * everything around it. In dark it cannot, because the fill deliberately stays
 * close to the page (1.72:1) so it reads as an illuminated area rather than a
 * second card — so the border does the separation instead. That is §3 rule 10
 * applied, not an exception to it. See spec §6.1a.
 */
export function InverseCard({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'rounded-[18px] bg-[hsl(var(--pv-inverse))] px-[18px] py-4',
        'border border-transparent dark:border-[hsl(var(--pv-inverse-border))]',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Card header: type.cardTitle 14/800. */
export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
      {children}
    </h2>
  );
}

/** type.label — 10.5/800 uppercase, tracked. Eyebrows only. */
export function Eyebrow({
  children,
  onInverse = false,
}: {
  children: React.ReactNode;
  onInverse?: boolean;
}) {
  return (
    <p
      className={cn(
        /* 7h's section labels: 11px/800 with .05em tracking. The comps use
           `text-transform` NOWHERE across all 76 — labels are typed in caps —
           but letter-spacing appears 240 times, so tracked caps are genuinely
           part of the language. `uppercase` stays so callers can pass normal
           text; the size and tracking now match the comp. */
        'text-[11px] font-extrabold uppercase tracking-[0.05em]',
        onInverse
          ? 'text-[hsl(var(--pv-on-inverse-muted))]'
          : 'text-[hsl(var(--pv-ink-3))]',
      )}
    >
      {children}
    </p>
  );
}

/**
 * Loading placeholder. §5: skeletons match final geometry so nothing shifts on
 * load, and shimmer runs on border.default. On the inverse surface the navy is
 * kept and the skeleton goes lighter instead.
 */
export function Skeleton({
  className,
  onInverse = false,
}: {
  className?: string;
  onInverse?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[6px] motion-reduce:animate-none',
        onInverse
          ? 'bg-[hsl(var(--pv-inverse-well))]'
          : 'bg-[hsl(var(--pv-border))]',
        className,
      )}
    />
  );
}
