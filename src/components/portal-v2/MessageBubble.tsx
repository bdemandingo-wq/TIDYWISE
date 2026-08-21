import { cn } from '@/lib/utils';

/**
 * One message in a thread. Read off mockup 8e.
 *
 *   both      max-width 78%, padding 11/14, text 12.5px at line-height 1.5,
 *             timestamp 9.5px, 3px below
 *   inbound   left-aligned, card surface with a hairline border,
 *             radius 16 16 16 5 — the 5px corner is the tail
 *   outbound  right-aligned, brand fill, radius 16 16 5 16, timestamp in
 *             on-brand ink at reduced strength
 *
 * The asymmetric corner is the whole tail treatment: no arrow, no pseudo
 * element, just one corner at 5px on the side the message came from. It is
 * worth keeping exactly, because it is what makes a stack of bubbles read
 * as a conversation rather than a list of cards.
 *
 * `status` is separate from `time` so a failed send can say so without
 * inventing a timestamp — an unsent message must never look delivered.
 */
export function MessageBubble({
  direction,
  children,
  time,
  status,
}: {
  direction: 'in' | 'out';
  children: React.ReactNode;
  time: string;
  status?: 'Delivered' | 'Sending' | 'Failed';
}) {
  const out = direction === 'out';
  return (
    <div
      className={cn(
        'max-w-[78%] px-3.5 py-[11px]',
        out
          ? 'self-end rounded-[16px_16px_5px_16px] bg-[hsl(var(--pv-brand))]'
          : 'self-start rounded-[16px_16px_16px_5px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))]',
      )}
    >
      <p
        className={cn(
          'text-[12.5px] font-medium leading-[1.5]',
          out ? 'text-[hsl(var(--pv-brand-ink))]' : 'text-[hsl(var(--pv-ink))]',
        )}
      >
        {children}
      </p>
      <p
        className={cn(
          'mt-[3px] text-[9.5px] font-medium',
          out ? 'text-[hsl(var(--pv-brand-ink))]/60' : 'text-[hsl(var(--pv-ink-3))]',
          /* A failed send is not a quieter delivered. It reads in danger ink
             on the inbound surface so it cannot be mistaken for sent. */
          status === 'Failed' && 'text-[hsl(var(--pv-danger))]',
        )}
      >
        {time}
        {status ? ` · ${status}` : ''}
      </p>
    </div>
  );
}
