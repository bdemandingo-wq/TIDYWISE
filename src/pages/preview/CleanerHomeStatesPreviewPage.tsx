import { useState } from 'react';
import { CleanerHomeView, type HomeJob, type SetupStep } from '@/components/portal-v2';

/**
 * The states of the wired 2a screen that a live account will not produce on
 * demand. Renders the SAME CleanerHomeView that /staff/home renders.
 */

const STEPS: SetupStep[] = [
  { id: 'availability', label: 'Set Availability', done: true },
  { id: 'documents', label: 'Upload Documents', done: false },
  { id: 'signatures', label: 'Sign Agreements', description: '2/3 signed', done: false },
  { id: 'payouts', label: 'Set Up Payouts', description: 'Verification pending', done: false, pending: true },
];

const JOBS: HomeJob[] = [
  {
    id: 'a', ref: '#1885', service: 'Deep Clean',
    status: { tone: 'success', label: 'Confirmed' },
    time: '1:00 PM – 4:00 PM', area: 'Miami · 33138', pay: '$100.00',
    note: 'Gate code 4417. Dog will bolt — keep the side gate shut.',
    unlockCaption: 'Full controls are on My jobs',
  },
  {
    id: 'b', ref: '#1902', service: 'Standard Clean',
    status: { tone: 'warn', label: 'In Progress' },
    time: '9:00 AM – 11:00 AM', area: 'No address on file', pay: 'Pay not set',
    unlockCaption: 'In progress',
  },
];

const CASES = [
  { id: 'setup-error', label: 'Setup failed', why: 'Live OnboardingProgress swallows this and renders steps as not-done.',
    props: { setup: STEPS, setupState: 'error' as const, week: { earned: '$642.50', jobs: '5', hours: '20.0' }, jobs: JOBS } },
  { id: 'week-error', label: 'Week failed', why: 'Stats become "—". Never $0.00 — a cleaner reading zero believes it.',
    props: { setup: STEPS, week: null, weekState: 'error' as const, jobs: JOBS } },
  { id: 'jobs-empty', label: 'No jobs', why: 'Genuinely empty, distinct from a failed read.',
    props: { setup: null, week: { earned: '$0.00', jobs: '0', hours: '0.0' }, jobs: [] } },
  { id: 'jobs-error', label: 'Jobs failed', why: 'Never the empty copy.',
    props: { setup: null, week: { earned: '$642.50', jobs: '5', hours: '20.0' }, jobs: [], jobsState: 'error' as const } },
  { id: 'setup-done', label: 'Setup complete', why: 'Card omitted entirely — nothing outstanding is not a slot.',
    props: { setup: null, week: { earned: '$642.50', jobs: '5', hours: '20.0' }, jobs: JOBS } },
  { id: 'missing-pay', label: 'A job with no pay', why: 'Card reads "Pay not set", never $0.00.',
    props: { setup: null, week: { earned: '$642.50', jobs: '5', hours: '20.0' }, jobs: [JOBS[1]] } },
  { id: 'deactivated', label: 'Deactivated', why: 'RLS returns zero rows; this must not read as "no jobs".',
    props: { mode: 'deactivated' as const, setup: null, week: null, jobs: [] } },
];

export default function CleanerHomeStatesPreviewPage() {
  const [i, setI] = useState(0);
  const [tab, setTab] = useState('today');
  const c = CASES[i];

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {CASES.map((x, n) => (
          <button key={x.id} type="button" onClick={() => setI(n)} aria-pressed={i === n}
            className={i === n
              ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
              : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'}>
            {x.label}
          </button>
        ))}
        <p className="w-full text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">{c.why}</p>
      </div>

      <CleanerHomeView
        mode="ready"
        name="Bruce Davis"
        notifications={12}
        tabs={[{ id: 'today', label: 'Assigned', count: (c.props.jobs ?? []).length }]}
        tab={tab}
        onTab={setTab}
        {...c.props}
      />
    </div>
  );
}
