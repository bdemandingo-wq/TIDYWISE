import { Card, CardTitle, Eyebrow, InverseCard, Skeleton } from './Card';
import { ChecklistRow } from './ChecklistRow';
import { JobCard } from './JobCard';
import { PortalHeader } from './PortalHeader';
import { ProgressBar } from './ProgressBar';
import { SegmentedTabs } from './SegmentedTabs';
import { StatBlock } from './StatBlock';
import { StatusBadge } from './StatusBadge';
import { BottomNav, CLEANER_NAV } from './BottomNav';

/**
 * Screen 2a's presentation, with no data fetching in it — same split as
 * JobDetailView, for the same reason: the states that matter are the ones a
 * live account will not produce on demand.
 *
 * Section states are INDEPENDENT. The setup checklist can fail while the jobs
 * list is fine, which is the normal shape of a partial outage and the case
 * §5.1 cares about most here: OnboardingProgress currently swallows its query
 * errors and renders a failed read as "not done", so a cleaner sees steps they
 * have already completed sitting unticked.
 */

export type SectionState = 'ready' | 'loading' | 'error';

export type SetupStep = {
  id: string;
  label: string;
  /** e.g. "2/3 signed", "No documents to sign yet" — the live wording. */
  description?: string;
  done: boolean;
  /** Payout has a third state between done and not-done. */
  pending?: boolean;
};

export type HomeJob = {
  id: string;
  ref: string;
  service: string;
  status: { tone: 'info' | 'success' | 'warn' | 'danger'; label: string };
  time: string;
  area: string;
  pay: string;
  note?: string;
  unlockCaption: string;
};

export function CleanerHomeView({
  mode,
  name,
  notifications = 0,
  setup,
  setupState = 'ready',
  week,
  weekState = 'ready',
  tabs,
  tab,
  onTab,
  jobs,
  jobsState = 'ready',
  onRetrySetup,
  onRetryWeek,
  onRetryJobs,
  onOpenJob,
}: {
  mode: 'ready' | 'loading' | 'noStaff' | 'deactivated' | 'error' | 'offline';
  name: string;
  notifications?: number;
  /** null omits the card — §5.1: nothing outstanding is not a slot. */
  setup: SetupStep[] | null;
  setupState?: SectionState;
  week: { earned: string; jobs: string; hours: string } | null;
  weekState?: SectionState;
  tabs: { id: string; label: string; count?: number }[];
  tab: string;
  onTab: (id: string) => void;
  jobs: HomeJob[];
  jobsState?: SectionState;
  onRetrySetup?: () => void;
  onRetryWeek?: () => void;
  onRetryJobs?: () => void;
  onOpenJob?: (id: string) => void;
}) {
  if (mode === 'noStaff' || mode === 'deactivated' || mode === 'error' || mode === 'offline') {
    const copy =
      mode === 'deactivated'
        ? {
            title: 'Your access is paused',
            body: 'Your staff account is not active, so your jobs are hidden. Nothing has been deleted. Ask your admin to reactivate you.',
          }
        : mode === 'noStaff'
          ? { title: 'No staff record', body: "This account isn't set up as a cleaner." }
          : mode === 'offline'
            ? {
                title: "You're offline",
                /* Never "no jobs": the jobs exist, the device cannot reach
                   them. Saying otherwise is a claim about their week. */
                body: 'Your jobs and pay are still there. They will load as soon as you have a signal again.',
              }
            : { title: "Couldn't load your portal", body: 'Your jobs and pay are unaffected.' };
    return (
      <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
        <PortalHeader eyebrow="Cleaner portal" greeting={name} name={name} notifications={0} />
        <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
          <Card>
            <div role="alert">
              <CardTitle>{copy.title}</CardTitle>
              <p className="mt-2 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                {copy.body}
              </p>
            </div>
          </Card>
        </div>
        <BottomNav items={CLEANER_NAV} active="home" />
      </main>
    );
  }

  const done = setup?.filter((s) => s.done).length ?? 0;
  const total = setup?.length ?? 0;

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <PortalHeader
        eyebrow="Cleaner portal"
        greeting={name}
        name={name}
        notifications={notifications}
      />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        {/* ── SetupChecklistCard ────────────────────────────────────────
            §5.1: omitted when nothing is outstanding; on failure it must NOT
            render a count, which reads as "you've done nothing". */}
        {setupState === 'loading' ? (
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
        ) : setupState === 'error' ? (
          <Card>
            <div role="alert">
              <CardTitle>Finish setting up</CardTitle>
              <p className="mt-2 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load your setup
              </p>
              <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                Steps you have already finished are unaffected.
              </p>
              <button
                type="button"
                onClick={onRetrySetup}
                className="mt-1.5 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          </Card>
        ) : setup && setup.length > 0 ? (
          <Card>
            <div className="flex items-center gap-2">
              <CardTitle>Finish setting up</CardTitle>
              <span className="ml-auto">
                <StatusBadge tone="warn" label={`${done}/${total}`} />
              </span>
            </div>
            <div className="mt-2.5">
              <ProgressBar
                value={total ? (done / total) * 100 : 0}
                label={`Setup ${done} of ${total} complete`}
              />
            </div>
            <div className="mt-2 flex flex-col">
              {setup.map((s) => (
                <ChecklistRow
                  key={s.id}
                  label={s.label}
                  done={s.done}
                  hint={s.description}
                  blocked={s.pending}
                />
              ))}
            </div>
          </Card>
        ) : null}

        {/* ── WeekSummaryCard — the one inverse surface ─────────────────
            §5.1: NEVER $0.00 on failure. A cleaner reading zero believes it. */}
        <InverseCard>
          <div className="flex items-baseline gap-3">
            <Eyebrow onInverse>This week</Eyebrow>
          </div>
          {weekState === 'loading' ? (
            <div className="mt-3 flex gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex-1">
                  <Skeleton onInverse className="h-6 w-3/4" />
                  <Skeleton onInverse className="mt-1.5 h-2.5 w-full" />
                </div>
              ))}
            </div>
          ) : weekState === 'error' || !week ? (
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
                onClick={onRetryWeek}
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-link-on-inverse))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-3 flex gap-3">
              <StatBlock value={week.earned} caption="Earned" />
              <StatBlock value={week.jobs} caption="Jobs" />
              <StatBlock value={week.hours} caption="Hours" />
            </div>
          )}
        </InverseCard>

        <SegmentedTabs tabs={tabs} value={tab} onChange={onTab} label="Job list" />

        {jobsState === 'loading' ? (
          <>
            <Skeleton className="h-[230px] rounded-[16px]" />
            <Skeleton className="h-[190px] rounded-[16px]" />
          </>
        ) : jobsState === 'error' ? (
          <Card>
            <div role="alert">
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load jobs
              </p>
              <button
                type="button"
                onClick={onRetryJobs}
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          </Card>
        ) : jobs.length === 0 ? (
          <Card>
            <div className="py-4 text-center">
              <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">No jobs here</p>
              <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                Nothing assigned in this list yet.
              </p>
            </div>
          </Card>
        ) : (
          jobs.map((j) => (
            <div key={j.id} onClick={() => onOpenJob?.(j.id)}>
              <JobCard job={j} />
            </div>
          ))
        )}
      </div>

      <BottomNav items={CLEANER_NAV} active="home" />
    </main>
  );
}
