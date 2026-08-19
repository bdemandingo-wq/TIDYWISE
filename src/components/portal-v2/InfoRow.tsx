import { cn } from '@/lib/utils';

/** §2 3a: icon column 28px; text; trailing action link. */
export function InfoRow({
  icon,
  title,
  sub,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pv-sunken))] text-[hsl(var(--pv-ink-3))]"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">
          {title}
        </span>
        {sub && (
          <span className="block truncate text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            {sub}
          </span>
        )}
      </span>
      {action &&
        (action.href ? (
          <a
            href={action.href}
            className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}
