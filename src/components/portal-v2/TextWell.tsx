import { cn } from '@/lib/utils';

/** §2 (3b NotesCard): inset well, min-height 44. §3 rule 10 — depth is insets. */
export function TextWell({
  id,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className={cn(
        'min-h-[44px] w-full resize-y rounded-[10px] border border-[hsl(var(--pv-border))]',
        'bg-[hsl(var(--pv-sunken))] px-3 py-2.5',
        'text-[12.5px] font-medium leading-[1.5] text-[hsl(var(--pv-ink))]',
        'placeholder:text-[hsl(var(--pv-ink-3))]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]',
        className,
      )}
    />
  );
}
