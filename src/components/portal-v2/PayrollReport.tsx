import { Card, CardTitle } from './Card';
import { InverseHeader } from './InverseHeader';
import { StatWell } from './StatWell';

/**
 * Comps 11c and 11d, stacked above the shift roster.
 *
 * 11c is a REPORT — a hero, two alerts and two pay-period cards, with no list
 * at all. 11d is the staff summary. The live screen is the roster. Rather than
 * choose, both comps render above the roster the wiring pass built, so the
 * screen reads report-then-detail.
 *
 * Every figure is passed in. This component computes nothing, because the page
 * already derives them once and a second derivation here is how two numbers on
 * one screen start disagreeing.
 *
 * §5.1: a caller that cannot read a figure passes undefined, and the slot
 * renders "—". Nothing here invents a zero.
 */

const money = (n: number | undefined) =>
  n === undefined ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type PayrollStaffRow = {
  id: string;
  name: string;
  /** '1099' | 'W-2' | null — shown as a chip beside the name, as in 11d. */
  classification: string | null;
  cleans: number;
  hours: number;
  ytd: number;
  pay: number;
  laborPct: number | null;
  /** Paid outside the app; 11d shows this instead of a labor percentage. */
  paidExternally?: boolean;
};

function PeriodGrid({ cells }: { cells: { value: string; caption: string; good?: boolean }[] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5">
      {cells.map(c => (
        <div key={c.caption} className="rounded-[12px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3">
          <p
            className={
              'text-[18px] font-extrabold tabular-nums ' +
              (c.good ? 'text-[hsl(var(--pv-success))]' : 'text-[hsl(var(--pv-ink))]')
            }
          >
            {c.value}
          </p>
          <p className="text-[10.5px] font-semibold text-[hsl(var(--pv-ink-3))]">{c.caption}</p>
        </div>
      ))}
    </div>
  );
}

export function PayrollReport({
  periodLabel,
  totalPayroll,
  avgLaborPct,
  revenueNet,
  profit,
  hours,
  cleans,
  negativeMarginCount,
  contractorsNeedingFiling,
  current,
  next,
  staff,
  onExport,
  ready,
}: {
  periodLabel: string;
  totalPayroll?: number;
  avgLaborPct?: number;
  revenueNet?: number;
  profit?: number;
  hours?: number;
  cleans?: number;
  negativeMarginCount: number;
  contractorsNeedingFiling: number;
  current?: { label: string; revenueNet: number; laborTotal: number; profit: number; laborPct: number; bookingCount: number };
  next?: { label: string; revenueNet: number; laborTotal: number; profit: number; missingPay: number };
  staff: PayrollStaffRow[];
  onExport?: () => void;
  ready: boolean;
}) {
  return (
    <>
      <InverseHeader
        eyebrow="Finance"
        business="Payroll Report"
        revenueLabel={`Total payroll · ${periodLabel}`}
        revenue={ready ? money(totalPayroll) : '—'}
        trend={
          ready && avgLaborPct !== undefined
            ? { direction: avgLaborPct > 60 ? 'down' : 'up', label: `${avgLaborPct.toFixed(1)}% avg labor` }
            : undefined
        }
        wells={
          <>
            <StatWell value={ready ? money(revenueNet) : '—'} caption="revenue (net)" />
            <StatWell value={ready ? money(profit) : '—'} caption="profit" />
            <StatWell
              value={ready && hours !== undefined ? hours.toFixed(1) : '—'}
              caption={ready && cleans !== undefined ? `hours · ${cleans} cleans` : 'hours'}
            />
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 pb-1 pt-4">
        {/* 11c's two alerts. Rendered only when they are true — an alert that
            is always on screen stops being an alert. */}
        {ready && negativeMarginCount > 0 && (
          <div className="rounded-[14px] border border-[hsl(var(--pv-danger))] bg-[hsl(var(--pv-danger-soft))] px-4 py-3">
            <p className="text-[13px] font-extrabold text-[hsl(var(--pv-danger))]">↘ Negative margin alert</p>
            <p className="mt-1 text-[12.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
              {negativeMarginCount} booking{negativeMarginCount === 1 ? ' has' : 's have'} negative
              profit — labor cost exceeds revenue.
            </p>
          </div>
        )}

        {ready && contractorsNeedingFiling > 0 && (
          <div className="rounded-[14px] border border-[hsl(var(--pv-warn))] bg-[hsl(var(--pv-warn-soft))] px-4 py-3">
            <p className="text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">⚠ 1099 tax filing required</p>
            <p className="mt-1 text-[12.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
              {contractorsNeedingFiling} contractor{contractorsNeedingFiling === 1 ? ' has' : 's have'} earned
              $600+ this year and require 1099-NEC filing.
            </p>
          </div>
        )}

        {current && (
          <Card>
            <CardTitle>
              Current pay period <span className="font-semibold text-[hsl(var(--pv-ink-3))]">· {current.label}</span>
            </CardTitle>
            <PeriodGrid
              cells={[
                { value: money(current.revenueNet), caption: 'revenue (net)' },
                { value: money(current.laborTotal), caption: 'payroll' },
                { value: money(current.profit), caption: `profit · ${current.laborPct.toFixed(1)}% labor`, good: current.profit > 0 },
                { value: String(current.bookingCount), caption: 'bookings' },
              ]}
            />
          </Card>
        )}

        {next && (
          <Card>
            <CardTitle>
              Next pay period <span className="font-semibold text-[hsl(var(--pv-ink-3))]">· {next.label}</span>
            </CardTitle>
            <PeriodGrid
              cells={[
                { value: money(next.revenueNet), caption: 'revenue' },
                { value: money(next.laborTotal), caption: 'payroll' },
                { value: money(next.profit), caption: 'profit', good: next.profit > 0 },
                { value: String(next.missingPay), caption: 'missing pay' },
              ]}
            />
          </Card>
        )}

        {/* 11d's staff summary. */}
        {staff.length > 0 && (
          <Card>
            <CardTitle>Staff summary</CardTitle>
            <div className="mt-1.5">
              {staff.map(s => (
                <div
                  key={s.id}
                  className="flex items-start gap-2.5 border-b border-[hsl(var(--pv-border))] py-2.5 last:border-b-0"
                >
                  <span className="mt-1 h-8 w-[3px] shrink-0 rounded-full bg-[hsl(var(--pv-brand))]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                      <span className="truncate">{s.name}</span>
                      {s.classification && (
                        <span className="shrink-0 rounded-full bg-[hsl(var(--pv-sunken))] px-1.5 py-px text-[10px] font-bold text-[hsl(var(--pv-ink-3))]">
                          {s.classification}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]">
                      {s.cleans} clean{s.cleans === 1 ? '' : 's'} · {s.hours.toFixed(1)} hrs · YTD {money(s.ytd)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">{money(s.pay)}</p>
                    {s.paidExternally ? (
                      <span className="mt-0.5 inline-block rounded-full bg-[hsl(var(--pv-success-soft))] px-1.5 py-px text-[10px] font-bold text-[hsl(var(--pv-success))]">
                        Paid (external)
                      </span>
                    ) : s.laborPct !== null ? (
                      <p
                        className={
                          'mt-0.5 text-[11px] font-bold tabular-nums ' +
                          (s.laborPct > 60 ? 'text-[hsl(var(--pv-warn))]' : 'text-[hsl(var(--pv-ink-3))]')
                        }
                      >
                        {s.laborPct.toFixed(1)}% labor
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
