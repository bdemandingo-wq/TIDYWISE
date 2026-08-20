import { useState } from 'react';
import {
  BottomNav,
  Card,
  CardTitle,
  ChecklistRow,
  Eyebrow,
  InverseCard,
  JobCard,
  PortalHeader,
  ProgressBar,
  SegmentedTabs,
  Skeleton,
  StatBlock,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screen 2a — Cleaner home. Preview route only; static data, replaces nothing
 * live. Built from docs/mobile-design-spec.md §2 (2a), §3, §5 and §5.1.
 */

type Load = 'ready' | 'loading' | 'error';
type Tab = 'today' | 'week' | 'available';

const SETUP = [
  { label: 'Add your payout details', done: true },
  { label: 'Sign your contractor agreement', done: true },
  { label: 'Upload your ID', done: false, hint: 'Takes about a minute' },
  {
    label: 'Turn on location for check-in',
    done: false,
    hint: 'Blocked — allow location in Settings',
    blocked: true,
  },
];

const JOBS = [
  {
    ref: '#1885',
    service: 'Deep Clean',
    status: { tone: 'success' as const, label: 'Confirmed' },
    time: '9:00 AM – 12:00 PM',
    area: 'Fort Lauderdale · 33334',
    pay: '$100.00',
    note: 'Gate code is 4417. Keep the side gate shut — the dog will bolt.',
    unlockCaption: 'Start job unlocks at 8:45 AM',
  },
  {
    ref: '#1891',
    service: 'Standard Clean',
    status: { tone: 'info' as const, label: 'Scheduled' },
    time: '1:30 PM – 3:30 PM',
    area: 'Wilton Manors · 33305',
    pay: '$64.00',
    unlockCaption: 'Start job unlocks at 1:15 PM',
  },
];

export default function CleanerHomePreviewPage() {
  const [state, setState] = useState<Load>('ready');
  const [tab, setTab] = useState<Tab>('today');

  const doneCount = SETUP.filter((s) => s.done).length;

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      {/* Preview-only control. Not part of screen 2a. */}
      <div className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Preview state
        </span>
        {(['ready', 'loading', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              state === s
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {s}
          </button>
        ))}
      </div>

      <PortalHeader
        eyebrow="Cleaner portal"
        greeting="Hi, Bruce"
        name="Bruce Schrank"
        notifications={12}
      />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        {/* ── SetupChecklistCard ───────────────────────────────────────────
            §5.1: omitted entirely when nothing is outstanding; on failure it
            must NOT render 0/4, which reads as "you've done nothing". */}
        {state === 'loading' ? (
          <Card>
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="mt-3 h-1.5 w-full" />
            <div className="mt-3 flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </Card>
        ) : state === 'error' ? (
          <Card>
            <div role="alert">
              <CardTitle>Finish setting up</CardTitle>
              <p className="mt-2 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load your setup
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center gap-2">
              <CardTitle>Finish setting up</CardTitle>
              <span className="ml-auto">
                <StatusBadge tone="warn" label={`${doneCount}/${SETUP.length}`} />
              </span>
            </div>
            <div className="mt-2.5">
              <ProgressBar
                value={(doneCount / SETUP.length) * 100}
                label={`Setup ${doneCount} of ${SETUP.length} complete`}
              />
            </div>
            <div className="mt-2 flex flex-col">
              {SETUP.map((s) => (
                <ChecklistRow key={s.label} {...s} />
              ))}
            </div>
          </Card>
        )}

        {/* ── WeekSummaryCard — the one inverse surface on this screen ────── */}
        <InverseCard>
          <div className="flex items-baseline gap-3">
            <Eyebrow onInverse>This week · Aug 17–23</Eyebrow>
            <button
              type="button"
              className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-link-on-inverse))] underline-offset-2 hover:underline"
            >
              Earnings
            </button>
          </div>

          {state === 'loading' ? (
            <div className="mt-3 flex gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex-1">
                  <Skeleton onInverse className="h-6 w-3/4" />
                  <Skeleton onInverse className="mt-1.5 h-2.5 w-full" />
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            /* §5.1: navy retained, stats become "—". NEVER $0.00 on failure —
               a cleaner reading zero earnings believes it. */
            <div role="alert" className="mt-3">
              <div className="flex gap-3">
                <StatBlock value="—" caption="Earned" />
                <StatBlock value="—" caption="Jobs" />
                <StatBlock value="—" caption="Hours" />
              </div>
              <p className="mt-3 text-[12.5px] font-semibold text-[hsl(var(--pv-on-inverse))]">
                Couldn&rsquo;t load this week
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-link-on-inverse))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-3 flex gap-3">
              <StatBlock value="$412.00" caption="Earned" />
              <StatBlock value="6" caption="Jobs" />
              <StatBlock value="14.5" caption="Hours" />
            </div>
          )}
        </InverseCard>

        <SegmentedTabs<Tab>
          label="Job list"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'today', label: 'Today', count: JOBS.length },
            { id: 'week', label: 'This week', count: 6 },
            { id: 'available', label: 'Available', count: 3 },
          ]}
        />

        {/* ── JobCard list ────────────────────────────────────────────────── */}
        {state === 'loading' ? (
          <>
            <Skeleton className="h-[230px] rounded-[16px]" />
            <Skeleton className="h-[190px] rounded-[16px]" />
          </>
        ) : state === 'error' ? (
          /* §5.1: "Couldn't load jobs" + Retry. Do NOT show the empty
             illustration — a cleaner told there are no jobs stops looking. */
          <Card>
            <div role="alert">
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load jobs
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          </Card>
        ) : (
          JOBS.map((j) => <JobCard key={j.ref} job={j} />)
        )}
      </div>

      <BottomNav active="home" />
    </main>
  );
}
