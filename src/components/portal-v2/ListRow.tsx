import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DateTile } from './DateTile';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';

/**
 * The row that ten admin list screens share.
 *
 * NOT four variants. The real columns say otherwise — bookings, recurring,
 * invoices and feedback each carry a date AND a money figure AND a status, so
 * "date-led" and "money-led" are not alternatives, they are two slots on the
 * same row. Modelling them as separate variants would mean four components
 * that each reimplement the other three's slots.
 *
 * So: one row, two axes.
 *
 *   lead      what anchors the left edge — a date tile, a person, a reference,
 *             or nothing. §3 rule 13: whatever it is, it is a FIXED gutter, so
 *             titles align down the list.
 *   trailing  money, a status pill, both, or neither.
 *
 * Real screens map onto it like this:
 *   bookings    lead=date    money + status
 *   recurring   lead=date    money + status
 *   invoices    lead=ref     money + status
 *   expenses    lead=date    money
 *   leads       lead=person  status
 *   feedback    lead=person  status
 *   tasks       lead=none    status
 *   notifications lead=none  (timestamp in meta)
 */
export type ListRowLead =
  | { kind: 'date'; weekday: string; day: string }
  | { kind: 'person'; name: string }
  | { kind: 'ref'; label: string }
  | { kind: 'none' };

export function ListRow({
  lead = { kind: 'none' },
  title,
  meta,
  money,
  status,
  onClick,
  className,
}: {
  lead?: ListRowLead;
  title: string;
  meta?: string;
  /** Pre-formatted. §5.1: a money figure never renders 0 on failure — the
   *  caller passes "—" instead, so this never invents a zero. */
  money?: string;
  status?: { tone: 'info' | 'success' | 'warn' | 'danger'; label: string };
  onClick?: () => void;
  className?: string;
}) {
  const Root = onClick ? 'button' : 'div';

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex w-full min-h-[56px] items-center gap-3 rounded-[10px] px-1 text-left',
        onClick &&
          'transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]',
        className,
      )}
    >
      {/* Fixed 46px gutter whatever fills it — §3 rule 13. */}
      {lead.kind !== 'none' && (
        <span className="flex w-[46px] shrink-0 justify-center">
          {lead.kind === 'date' ? (
            <DateTile weekday={lead.weekday} day={lead.day} variant="static" />
          ) : lead.kind === 'person' ? (
            <Avatar name={lead.name} />
          ) : (
            <span className="flex h-9 w-[46px] items-center justify-center rounded-[8px] bg-[hsl(var(--pv-sunken))] text-[10.5px] font-extrabold tabular-nums text-[hsl(var(--pv-ink-3))]">
              {lead.label}
            </span>
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">
          {title}
        </span>
        {meta && (
          <span className="block truncate text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            {meta}
          </span>
        )}
      </span>

      {(money || status) && (
        <span className="flex shrink-0 flex-col items-end gap-1">
          {money && (
            <span className="text-[13px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
              {money}
            </span>
          )}
          {status && <StatusBadge tone={status.tone} label={status.label} />}
        </span>
      )}

      {onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--pv-ink-4))]" aria-hidden />
      )}
    </Root>
  );
}
