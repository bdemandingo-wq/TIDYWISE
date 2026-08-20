import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * §2 (3b BenefitCard): outlined gold; selected = solid `text.primary` bg with
 * white text.
 *
 * The selected fill is deliberately --pv-ink and NOT --pv-gold. Gold ink on a
 * gold fill sits within 1.2:1 in both themes (§1.1b), so the spec's choice of
 * an ink fill is what keeps the selected row legible — it is not an arbitrary
 * contrast between selected and unselected.
 */
export function ChoiceRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--pv-surface))]',
        selected
          ? 'border-transparent bg-[hsl(var(--pv-ink))]'
          : 'border-[hsl(var(--pv-gold))] bg-[hsl(var(--pv-surface))]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected
            ? 'border-transparent bg-[hsl(var(--pv-surface))]'
            : 'border-[hsl(var(--pv-gold))]',
        )}
      >
        {selected && (
          <Check className="h-2.5 w-2.5 text-[hsl(var(--pv-ink))]" strokeWidth={3.5} />
        )}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 text-[12.5px] font-bold',
          selected
            ? 'text-[hsl(var(--pv-surface))]'
            : 'text-[hsl(var(--pv-ink))]',
        )}
      >
        {label}
      </span>
    </button>
  );
}
