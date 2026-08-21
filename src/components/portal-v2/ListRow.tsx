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
type Badge = { tone: 'info' | 'success' | 'warn' | 'danger'; label: string };

export type ListRowLead =
  | { kind: 'date'; weekday: string; day: string }
  | { kind: 'person'; name: string }
  | { kind: 'ref'; label: string }
  | { kind: 'none' };

export function ListRow({
  lead = { kind: 'none' },
  title,
  meta,
  lines,
  money,
  status,
  onClick,
  className,
}: {
  lead?: ListRowLead;
  title: string;
  meta?: string;
  /* Long-form fields that each get their own line rather than joining `meta`.
     The bookings row needs two — the customer email that sits under the name
     on desktop, and the staff assignment. Packing them into `meta` pushed
     "Unassigned" past the ellipsis at 390px, and scanning for unassigned work
     is the reason that column exists. Same slot name and behaviour as
     PersonRow.lines. Optional. */
  lines?: string[];
  /** Pre-formatted. §5.1: a money figure never renders 0 on failure — the
   *  caller passes "—" instead, so this never invents a zero. */
  money?: string;
  /* One badge or several. The admin bookings row carries two — clean status
     and payment status — and payment is not decoration there: the status
     vocabulary itself is money-framed ("pending payment", not "pending"), so
     dropping the second badge would remove the fact the screen is organised
     around. Existing callers pass a single object and are unaffected. */
  status?: Badge | Badge[];
  onClick?: () => void;
  className?: string;
}) {
  const Root = onClick ? 'button' : 'div';
  const badges: Badge[] = status ? (Array.isArray(status) ? status : [status]) : [];

  return (
    <Root
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        /* Row anatomy read off mockups 4c and 8a, which agree exactly:

             card    background, 1px border, radius 14px, padding 13px/16px,
                     stacked by ListShell with 10px gaps
             row 1   flex, gap 8px  -> ref (12px/800, brand) · title (flex:1,
                     13.5px/700) · money (14px/800). Money ends the SAME line
                     as the title and outranks it in both size and weight.
             row 2   meta, 11px, margin-top 3px
             row 3   badges, gap 6px, margin-top 9px, with the trailing
                     control pushed right by margin-left:auto

           The previous build put money and badges in a right-hand column and
           the ref in a 46px left gutter. Both are corrected here. */
        'block w-full rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-4 py-[13px] text-left',
        onClick &&
          'transition-colors duration-150 ease-out active:bg-[hsl(var(--pv-sunken))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]',
        className,
      )}
    >
      <span className="flex items-center gap-2">
        {/* A date or person lead keeps the 46px gutter (§3 rule 13); a `ref`
            is inline here, which is what both comps show. */}
        {lead.kind === 'date' && (
          <span className="flex w-[46px] shrink-0 justify-center">
            <DateTile weekday={lead.weekday} day={lead.day} variant="static" />
          </span>
        )}
        {lead.kind === 'person' && (
          <span className="flex w-[46px] shrink-0 justify-center">
            <Avatar name={lead.name} />
          </span>
        )}
        {lead.kind === 'ref' && (
          <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-[hsl(var(--pv-brand))]">
            {lead.label}
          </span>
        )}

        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[hsl(var(--pv-ink))]">
          {title}
        </span>

        {money && (
          <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
            {money}
          </span>
        )}
      </span>

      {meta && (
        <span className="mt-[3px] block truncate text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
          {meta}
        </span>
      )}
      {lines?.map((l) => (
        <span
          key={l}
          className="mt-[3px] block truncate text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]"
        >
          {l}
        </span>
      ))}

      {badges.length > 0 && (
        <span className="mt-[9px] flex flex-wrap items-center gap-1.5">
          {badges.map((b, i) => (
            <StatusBadge key={`${b.label}-${i}`} tone={b.tone} label={b.label} />
          ))}
        </span>
      )}


    </Root>
  );
}
