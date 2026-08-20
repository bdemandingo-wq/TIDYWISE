import { cn } from '@/lib/utils';

/** §2 (1c): equal 4px segments, filled = primary. One per step. */
export function StepProgressBar({
  total,
  complete,
  label,
}: {
  total: number;
  complete: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={complete}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={label}
      className="flex gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full',
            i < complete
              ? 'bg-[hsl(var(--pv-brand))]'
              : 'bg-[hsl(var(--pv-sunken))]',
          )}
        />
      ))}
    </div>
  );
}
