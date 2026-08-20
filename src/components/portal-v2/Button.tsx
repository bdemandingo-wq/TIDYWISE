import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'disabled-visible';

/**
 * §4 prop sketch: { variant, size: 'md'(40)|'lg'(48), fullWidth?, icon? }
 *
 * `disabled-visible` is a real variant, not `disabled` with opacity. WCAG
 * exempts disabled controls from contrast, and the spec declines that
 * exemption: cleaners read these screens outdoors, so a locked action stays
 * legible at 4.5:1 via --pv-ink-disabled. Opacity would have made the final
 * colour unpredictable and unmeasurable, which is how the old
 * `disabled:opacity-50` sites drifted between 1.50:1 and 6.42:1.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  onInverse = false,
  children,
  className,
  ...rest
}: {
  variant?: Variant;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  /** Rendered on `surface.inverse`. Flips secondary/ghost to the white pair —
   *  §3 rule 3 still holds, so there is one filled action per zone there too. */
  onInverse?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>) {
  const locked = variant === 'disabled-visible';

  return (
    <button
      type="button"
      disabled={locked}
      aria-disabled={locked || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[12px]',
        'text-[13px] font-extrabold transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        onInverse
          ? 'focus-visible:ring-[hsl(var(--pv-on-inverse))] focus-visible:ring-offset-[hsl(var(--pv-inverse))]'
          : 'focus-visible:ring-[hsl(var(--pv-brand))] focus-visible:ring-offset-[hsl(var(--pv-surface))]',
        size === 'lg' ? 'h-12' : 'h-10',
        fullWidth ? 'w-full' : 'px-4',
        variant === 'primary' &&
          'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))] active:bg-[hsl(var(--pv-brand-hover))]',
        variant === 'secondary' &&
          (onInverse
            ? 'bg-[hsl(var(--pv-on-inverse))] text-[hsl(var(--pv-inverse))]'
            : 'border border-[hsl(var(--pv-border-strong))] bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))] active:bg-[hsl(var(--pv-sunken))]'),
        variant === 'ghost' &&
          (onInverse
            ? 'text-[hsl(var(--pv-on-inverse))]'
            : 'text-[hsl(var(--pv-brand))] active:bg-[hsl(var(--pv-sunken))]'),
        locked &&
          'cursor-not-allowed bg-[hsl(var(--pv-disabled-btn))] text-[hsl(var(--pv-ink-disabled))]',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
