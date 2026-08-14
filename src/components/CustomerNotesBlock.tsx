import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CUSTOMER_NOTES_LABEL, customerNotesToRender } from '@/lib/customerNotes';

/**
 * The customer's own words on their booking.
 *
 * READ-ONLY BY CONSTRUCTION. This renders text, never a form control. A disabled
 * <Textarea> would look editable enough to try, and the edit dialog's save path
 * (BookingDialogs.tsx) writes `notes` only — so a stray edit here would vanish
 * silently on save. Text cannot be edited, so the question never arises.
 *
 * Renders NOTHING when there is no note. Most bookings have none and always
 * will: bookings.customer_notes is only populated by forwards from the cleaning
 * site, and was never backfilled. An empty labelled box on every booking would
 * be clutter — and on a staff job card, clutter in front of someone deciding
 * whether to accept work.
 *
 * Two variants because the surfaces already differ, and matching each is what
 * keeps the block from looking bolted on:
 *   'card'  — admin dialogs, plain bordered card (mirrors BookingDialogs' own
 *             read-only notes block)
 *   'staff' — job cards, tinted box (mirrors their Special Instructions block)
 *
 * The staff variant uses INFO tones while Special Instructions uses WARNING
 * tones. Two identically-coloured boxes stacked would read as one message split
 * in half; the different tone is what makes "two distinct sources" legible
 * before anyone reads the labels.
 *
 * See docs/superpowers/plans/2026-08-14-surface-customer-notes.md
 */
export function CustomerNotesBlock({
  value,
  variant = 'card',
  className,
}: {
  /** Raw `bookings.customer_notes`. Untrusted — narrowing happens in the helper. */
  value: unknown;
  variant?: 'card' | 'staff';
  className?: string;
}) {
  const text = customerNotesToRender(value);
  if (!text) return null;

  if (variant === 'staff') {
    return (
      <div className={cn('p-3 rounded-lg bg-info/10 border border-info/20', className)}>
        <div className="flex items-start gap-2">
          <FileText className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-info mb-1">{CUSTOMER_NOTES_LABEL}</p>
            {/* whitespace-pre-wrap: access instructions are almost always
                multi-line, and the helper preserves internal line breaks. */}
            <p className="text-sm text-info whitespace-pre-wrap">{text}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <p className="text-xs text-muted-foreground mb-1">{CUSTOMER_NOTES_LABEL}</p>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}
