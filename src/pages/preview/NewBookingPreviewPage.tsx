import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AssigneeSuggestRow,
  Button,
  DayPicker,
  DetailHeader,
  OTHER_TIME,
  formatTime24,
  isoParts,
  Eyebrow,
  StepCard,
  StepProgressBar,
  StickyFooterBar,
  TimeChipRow,
  type PickableDate,
  type TimeChoice,
} from '@/components/portal-v2';

/**
 * Screen 1c — New booking. Preview route only; static data, replaces nothing
 * live. From docs/mobile-design-spec.md §2 (1c), §3 rule 12, §5 and §5.1.
 *
 * §3 rule 12: the four steps collapse rather than paginate. Completed steps
 * compress to a one-line summary with Edit, exactly one is expanded, and the
 * total stays pinned in the footer throughout.
 */

type Load = 'ready' | 'error';

const TODAY = '2026-08-20';

const DATES: PickableDate[] = [
  { iso: '2026-08-20' },
  { iso: '2026-08-21' },
  { iso: '2026-08-22' },
  { iso: '2026-08-23', disabled: true },
  { iso: '2026-08-24' },
];

const TIMES: TimeChoice[] = [
  { id: 't1', label: '8:00 AM' },
  { id: 't2', label: '10:00 AM' },
  { id: 't3', label: '1:00 PM' },
  { id: 't4', label: '3:00 PM' },
];

const STEPS = ['Customer', 'Service', 'Schedule', 'Review'];

export default function NewBookingPreviewPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<Load>('ready');
  const [active, setActive] = useState(2); // Schedule is the expanded step
  const [date, setDate] = useState<string | null>('2026-08-21');
  const [time, setTime] = useState<string | null>('t2');
  const [otherTime, setOtherTime] = useState('');

  /* §3 rule 12: a collapsed step has to state what was chosen, and that has to
     include values that came from the escape hatches — a date picked months out
     in the calendar, or a time typed into "Other". A summary built from the
     chips alone would go blank exactly when the user did something unusual. */
  const timeLabel =
    time === OTHER_TIME
      ? otherTime
        ? formatTime24(otherTime)
        : null
      : (TIMES.find((t) => t.id === time)?.label ?? null);
  const scheduleSummary =
    date && timeLabel ? `${isoParts(date).label} · ${timeLabel}` : 'Not set';

  const summaries = [
    'Bianca Schrank · (hidden)',
    'Deep Clean · 3 bed / 2 bath',
    scheduleSummary,
    '',
  ];

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Preview state
        </span>
        {(['ready', 'error'] as const).map((s) => (
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
            {s === 'error' ? 'cleaners error' : s}
          </button>
        ))}
      </div>

      <DetailHeader title="New booking" onBack={() => navigate(-1)} />

      <div className="px-5 pb-3.5">
        <StepProgressBar total={STEPS.length} complete={active} label="Booking progress" />
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        {STEPS.map((title, i) => (
          <StepCard
            key={title}
            index={i + 1}
            title={title}
            state={i < active ? 'complete' : i === active ? 'active' : 'upcoming'}
            summary={summaries[i]}
            onEdit={() => setActive(i)}
          >
            {i === 2 && (
              <>
                <Eyebrow>Date</Eyebrow>
                <div className="mt-2">
                  <DayPicker
                    label="Available dates"
                    dates={DATES}
                    value={date}
                    onChange={setDate}
                    today={TODAY}
                  />
                </div>

                <div className="mt-4">
                  <Eyebrow>Time</Eyebrow>
                  <div className="mt-2">
                    <TimeChipRow
                      label="Available times"
                      times={TIMES}
                      value={time}
                      onChange={setTime}
                      allowOther
                      otherTime={otherTime}
                      onOtherTime={setOtherTime}
                    />
                  </div>
                </div>

                {/* §5.1: the step stays completable by picking manually, so
                    Change is present whether the suggestion loaded or not. */}
                <div className="mt-4">
                  <Eyebrow>Cleaner</Eyebrow>
                  <div className="mt-2">
                    <AssigneeSuggestRow
                      name="Maria Gonzalez"
                      state={state === 'error' ? 'error' : 'ready'}
                      onRetry={() => setState('ready')}
                    />
                  </div>
                </div>
              </>
            )}

            {/* §3 rule 12 is a collapse rule, and a collapse needs something to
                trigger it. Without a forward action the preview can only ever
                move backwards through Edit, so a completed step's one-line
                summary — the whole point of the rule — is never reachable. */}
            {i === active && i < STEPS.length - 1 && (
              <div className="mt-3.5 flex justify-end">
                <Button variant="primary" onClick={() => setActive(i + 1)}>
                  Continue
                </Button>
              </div>
            )}
          </StepCard>
        ))}
      </div>

      {/* §3 rule 11 + 12: the total stays pinned throughout the flow. */}
      <StickyFooterBar eyebrow="Total" value="$240.00">
        <Button variant="secondary">Draft</Button>
        <Button variant="primary">Save booking</Button>
      </StickyFooterBar>
    </main>
  );
}
