import { cn } from '@/lib/utils';

/** §4: { tone: 'info'|'success'|'warn'|'danger', label } — type.chip 10.5/700. */
export function StatusBadge({
  tone,
  label,
}: {
  tone: 'info' | 'success' | 'warn' | 'danger';
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px]',
        'text-[10px] font-bold',
        tone === 'info' &&
          'bg-[hsl(var(--pv-brand-soft))] text-[hsl(var(--pv-brand))]',
        tone === 'success' &&
          'bg-[hsl(var(--pv-success-soft))] text-[hsl(var(--pv-success))]',
        tone === 'warn' &&
          'bg-[hsl(var(--pv-warn-soft))] text-[hsl(var(--pv-warn))]',
        tone === 'danger' &&
          'bg-[hsl(var(--pv-danger-soft))] text-[hsl(var(--pv-danger))]',
      )}
    >
      {label}
    </span>
  );
}
