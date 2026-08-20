import { cn } from '@/lib/utils';

/** §2 (2b): ShortcutGrid is two of these. Flat, like every other card (§3 r10). */
export function ShortcutCard({
  icon,
  title,
  sub,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[84px] flex-1 flex-col items-start gap-1.5 rounded-[16px] border',
        'border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-3.5 text-left',
        'transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-bg))]',
        className,
      )}
    >
      <span className="text-[hsl(var(--pv-brand))]" aria-hidden>
        {icon}
      </span>
      <span className="text-[13px] font-bold leading-tight text-[hsl(var(--pv-ink))]">{title}</span>
      {sub && (
        <span className="text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">{sub}</span>
      )}
    </button>
  );
}
