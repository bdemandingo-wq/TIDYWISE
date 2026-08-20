import { useState } from 'react';
import { JobDetailView, type JobDetailJob } from '@/components/portal-v2';
import type { CleanerPayResult } from '@/lib/wageCalculation';

/**
 * The four states of the wired 3a screen that live data will not produce on
 * demand — and one that would mean deactivating a real person to look at.
 *
 * Preview route only. Renders the SAME JobDetailView the live
 * /staff/job/:id renders; only the data is fixed.
 */

const TZ = 'America/New_York';

const base: JobDetailJob = {
  booking_number: 1885,
  scheduled_at: '2026-08-22T13:00:00.000Z',
  duration: 180,
  status: 'confirmed',
  address: '4120 NE 12th Terrace',
  city: 'Fort Lauderdale',
  state: 'FL',
  zip_code: '33334',
  extraLabels: ['Inside oven', 'Interior windows'],
  notes: 'Gate code is 4417. The dog is friendly but will bolt — keep the side gate shut.',
  customer_notes: 'Please skip the office, I will be on calls all morning.',
  cleaner_checkin_at: null,
  cleaner_checkout_at: null,
  customer: { first_name: 'Bianca', last_name: 'Schrank' },
  service: { name: 'Deep Clean' },
};

const pay = (over: Partial<CleanerPayResult>): CleanerPayResult =>
  ({
    calculatedPay: 100,
    hoursWorked: 3,
    wageType: 'flat',
    wageRate: 100,
    isMissingPay: false,
    source: 'pay_expected',
    isExact: true,
    ...over,
  }) as CleanerPayResult;

const CASES = [
  {
    id: 'missing-pay',
    label: 'Missing pay',
    why: 'resolveCleanerPay().isMissingPay — an admin has not set it. Not $0.00, not an error.',
    props: {
      mode: 'ready' as const,
      job: base,
      pay: pay({ isMissingPay: true, calculatedPay: 0, source: 'computed', isExact: false, wageRate: 0 }),
      team: null,
    },
  },
  {
    id: 'deactivated',
    label: 'Deactivated cleaner',
    why: 'Staff RLS returns zero bookings; the staff row still reads and says why.',
    props: { mode: 'deactivated' as const, job: null, pay: null, team: null },
  },
  {
    id: 'no-address',
    label: 'No address',
    why: 'Directions drops to disabled-visible rather than becoming a dead button.',
    props: {
      mode: 'ready' as const,
      job: { ...base, address: null, city: null, state: null, zip_code: null, extraLabels: [], customer_notes: null },
      pay: pay({}),
      team: null,
    },
  },
  {
    id: 'team-share',
    label: 'Team job with pay share',
    why: 'booking_team_assignments.pay_share is priority 1 in the payout engine.',
    props: {
      mode: 'ready' as const,
      job: { ...base, cleaner_checkin_at: '2026-08-22T13:04:00.000Z' },
      pay: pay({ calculatedPay: 62.5, source: 'pay_share', isExact: true }),
      team: { pay_share: 62.5, is_primary: true },
    },
  },
];

export default function JobDetailStatesPreviewPage() {
  const [i, setI] = useState(0);
  const c = CASES[i];

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {CASES.map((x, n) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setI(n)}
            aria-pressed={i === n}
            className={
              i === n
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {x.label}
          </button>
        ))}
        <p className="w-full text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">{c.why}</p>
      </div>

      <JobDetailView {...c.props} orgTz={TZ} onBack={() => {}} onRetry={() => {}} />
    </div>
  );
}
