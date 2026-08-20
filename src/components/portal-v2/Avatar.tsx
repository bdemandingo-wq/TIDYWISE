import { cn } from '@/lib/utils';

/**
 * §4: deterministic hue from name.
 *
 * The spec names a bespoke avatar palette (avatar.pinkBg/text + a four-hue set).
 * This uses the existing --pv-*-soft / --pv-* semantic pairs instead: they are
 * already measured in both themes (§6.0), so the avatar inherits verified
 * contrast rather than adding four unmeasured token pairs for decoration.
 */
const HUES = [
  'bg-[hsl(var(--pv-brand-soft))] text-[hsl(var(--pv-brand))]',
  'bg-[hsl(var(--pv-success-soft))] text-[hsl(var(--pv-success))]',
  'bg-[hsl(var(--pv-warn-soft))] text-[hsl(var(--pv-warn))]',
  'bg-[hsl(var(--pv-danger-soft))] text-[hsl(var(--pv-danger))]',
];

function hueFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'text-[12.5px] font-extrabold',
        hueFor(name),
        className,
      )}
    >
      {initials}
    </span>
  );
}
