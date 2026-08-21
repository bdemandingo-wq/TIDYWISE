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
  description,
  badge,
  selected,
  onClick,
}: {
  label: string;
  /* 5b's presets each carry a line explaining what they DO — "Only alerts
     that need a response", "Every event, on every channel". Choosing
     between four notification setups without that is guessing. */
  description?: string;
  /* "Recommended" on the Balanced preset. */
  badge?: string;
  selected: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-[44px] w-full items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left',
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
          'mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected
            ? 'border-transparent bg-[hsl(var(--pv-surface))]'
            : 'border-[hsl(var(--pv-gold))]',
        )}
      >
        {selected && (
          <Check className="h-2.5 w-2.5 text-[hsl(var(--pv-ink))]" strokeWidth={3.5} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 truncate text-[12.5px] font-bold',
              selected ? 'text-[hsl(var(--pv-surface))]' : 'text-[hsl(var(--pv-ink))]',
            )}
          >
            {label}
          </span>
          {badge && (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-[2px] text-[9.5px] font-extrabold',
                selected
                  ? 'bg-[hsl(var(--pv-surface))]/20 text-[hsl(var(--pv-surface))]'
                  : 'bg-[hsl(var(--pv-brand-soft))] text-[hsl(var(--pv-brand))]',
              )}
            >
              {badge}
            </span>
          )}
        </span>
        {description && (
          <span
            className={cn(
              'mt-[2px] block text-[11px] font-normal leading-[1.45]',
              selected ? 'text-[hsl(var(--pv-surface))]/75' : 'text-[hsl(var(--pv-ink-3))]',
            )}
          >
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
