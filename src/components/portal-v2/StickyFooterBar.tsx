import { cn } from '@/lib/utils';

/**
 * §3 rule 11: sticky footers are transaction summaries — eyebrow + figure left,
 * primary action right, visible throughout a commit flow (1c, 3b).
 * §1.4: separates with a top border, never a shadow.
 */
export function StickyFooterBar({
  eyebrow,
  value,
  children,
  className,
}: {
  eyebrow: string;
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 flex items-center gap-3 border-t border-[hsl(var(--pv-border))]',
        'bg-[hsl(var(--pv-surface))] px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          {eyebrow}
        </p>
        <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">{value}</p>
      </div>
      {children}
    </div>
  );
}
