import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Trophy } from 'lucide-react';
import {
  Button,
  Card,
  CardTitle,
  ChoiceRow,
  DayPicker,
  DetailHeader,
  Eyebrow,
  Skeleton,
  StatusBadge,
  StickyFooterBar,
  TextWell,
  TimeChipRow,
  type PickableDate,
  type TimeChoice,
} from '@/components/portal-v2';

/**
 * Screen 3b — Client booking request. Preview route only; static data,
 * replaces nothing live. From docs/mobile-design-spec.md §2 (3b), §3, §5, §5.1.
 *
 * §3 rule 2: this screen has no headline number, so it has NO inverse surface
 * anywhere. That is the rule working, not an omission.
 */

type Load = 'ready' | 'loading' | 'error';

const DATES: PickableDate[] = [
  { id: 'd1', weekday: 'Thu', day: '21' },
  { id: 'd2', weekday: 'Fri', day: '22' },
  { id: 'd3', weekday: 'Sat', day: '23', disabled: true },
  { id: 'd4', weekday: 'Sun', day: '24' },
];

const TIMES: TimeChoice[] = [
  { id: 't1', label: '8:00 AM' },
  { id: 't2', label: '10:00 AM' },
  { id: 't3', label: '1:00 PM' },
  { id: 't4', label: '3:00 PM', disabled: true },
  { id: 't5', label: 'Flexible' },
];

const BENEFITS = ['Free oven clean', 'Free interior windows', '$25 off this visit'];

export default function BookingRequestPreviewPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<Load>('ready');
  const [date, setDate] = useState<string | null>('d2');
  const [time, setTime] = useState<string | null>('t2');
  const [benefit, setBenefit] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const chosenDate = DATES.find((d) => d.id === date);
  const chosenTime = TIMES.find((t) => t.id === time);
  const slot =
    chosenDate && chosenTime
      ? `${chosenDate.weekday} ${chosenDate.day} · ${chosenTime.label}`
      : 'Pick a date and time';

  /* §5.1: submission is blocked while the address is errored — we cannot send
     a cleaner to an address we failed to read. */
  const blocked = state !== 'ready' || !chosenDate || !chosenTime;

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
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

      <DetailHeader
        title="Request a booking"
        sub="We'll confirm within 24 hours"
        onBack={() => navigate(-1)}
      />

      <div className="flex flex-1 flex-col gap-3 px-5 pb-6">
        {/* ── ScheduleCard ─────────────────────────────────────────────────── */}
        <Card>
          <CardTitle>Pick a date</CardTitle>
          <div className="mt-3">
            <DayPicker
              label="Available dates"
              dates={DATES}
              value={date}
              onChange={setDate}
              onMore={() => {}}
            />
          </div>
          <div className="mt-4">
            <Eyebrow>Time</Eyebrow>
            <div className="mt-2">
              <TimeChipRow label="Available times" times={TIMES} value={time} onChange={setTime} />
            </div>
          </div>
        </Card>

        {/* ── AddressCard ──────────────────────────────────────────────────── */}
        <Card>
          {state === 'loading' ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-1.5 h-2.5 w-2/3" />
              </div>
            </div>
          ) : state === 'error' ? (
            /* §5.1: distinct from "No address on file" — and submission is
               blocked above while this is the state. */
            <div role="alert">
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load your address
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pv-sunken))] text-[hsl(var(--pv-ink-3))]"
              >
                <Home className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">Primary address</p>
                <p className="truncate text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                  812 NE 17th Ave, Fort Lauderdale, FL 33304
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Change
              </button>
            </div>
          )}
        </Card>

        {/* ── BenefitCard (gold family) ────────────────────────────────────
            §5.1: omitted when no benefits are available AND omitted on error —
            the only surface where the two collapse, deliberately, because an
            unavailable optional perk is not worth an error. */}
        {state === 'ready' && (
          <Card>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 shrink-0 text-[hsl(var(--pv-gold-ink))]" aria-hidden />
              <CardTitle>Redeem a Gold benefit</CardTitle>
              <span className="ml-auto">
                <StatusBadge tone="info" label="Optional" />
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {BENEFITS.map((b) => (
                <ChoiceRow
                  key={b}
                  label={b}
                  selected={benefit === b}
                  onClick={() => setBenefit(benefit === b ? null : b)}
                />
              ))}
            </div>
          </Card>
        )}

        {/* ── NotesCard ────────────────────────────────────────────────────── */}
        <Card>
          <label htmlFor="booking-notes" className="block">
            <CardTitle>Anything we should know?</CardTitle>
          </label>
          <div className="mt-3">
            <TextWell
              id="booking-notes"
              placeholder="Gate codes, pets, parking, rooms to skip…"
              value={notes}
              onChange={setNotes}
            />
          </div>
        </Card>
      </div>

      <StickyFooterBar eyebrow="Requesting" value={slot}>
        <Button variant={blocked ? 'disabled-visible' : 'primary'} size="lg">
          Submit request
        </Button>
      </StickyFooterBar>
    </main>
  );
}
