import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MapPin, User, Navigation, MapPinned, ClipboardList } from 'lucide-react';
import {
  Card,
  CardTitle,
  DetailHeader,
  Eyebrow,
  InfoRow,
  InverseCard,
  NoteWell,
  NoteWellError,
  PayWell,
  Button,
  Skeleton,
} from '@/components/portal-v2';

/**
 * Screen 3a — Cleaner job detail. Preview route only; nothing here is wired to
 * live data, and it deliberately does not replace any existing portal screen.
 * Built from docs/mobile-design-spec.md §2 (3a), §5 and §5.1.
 */

type Load = 'ready' | 'loading' | 'error';

const JOB = {
  ref: '#1885 · Deep Clean',
  when: 'Sun, Aug 16 · 9:00 AM – 12:00 PM',
  pay: '$100.00',
  rate: [
    { label: 'Base rate', value: '$28.00/hr' },
    { label: 'Hours scheduled', value: '3.0' },
    { label: 'Travel bonus', value: '$16.00' },
  ],
  contact: [
    { icon: <User className="h-4 w-4" aria-hidden />, title: 'Bianca Schrank', sub: 'Customer since Mar 2026' },
    { icon: <Phone className="h-4 w-4" aria-hidden />, title: '(561) 583-0771', sub: 'Mobile', action: { label: 'Call', href: 'tel:+15615830771' } },
    { icon: <MapPin className="h-4 w-4" aria-hidden />, title: '4120 NE 12th Terrace', sub: 'Fort Lauderdale, FL 33334', action: { label: 'Map', href: '#' } },
  ],
  instructions:
    'Gate code is 4417. The dog is friendly but will bolt — keep the side gate shut. Do not use bleach on the kitchen counters, they are honed marble.',
  propertyNotes:
    '3 bed / 2 bath · 1,850 sq ft. Supplies are in the laundry cupboard off the garage. Street parking only after 9am.',
};

export default function JobDetailPreviewPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<Load>('ready');

  return (
    <main className="portal-v2 min-h-dvh bg-[hsl(var(--pv-bg))] pb-10">
      {/* Preview-only control. Not part of screen 3a. */}
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
        title={JOB.ref}
        sub={JOB.when}
        badge={{ tone: 'success', label: 'Confirmed' }}
        onBack={() => navigate(-1)}
      />

      <div className="flex flex-col gap-3 px-5">
        {/* ── PayHeroCard — the one inverse surface on this screen ─────────── */}
        <InverseCard>
          <Eyebrow onInverse>Your pay</Eyebrow>
          {state === 'loading' ? (
            <>
              <Skeleton onInverse className="mt-1.5 h-[30px] w-[132px]" />
              <div className="mt-3 flex flex-col gap-1.5">
                <Skeleton onInverse className="h-3 w-full" />
                <Skeleton onInverse className="h-3 w-full" />
                <Skeleton onInverse className="h-3 w-2/3" />
              </div>
            </>
          ) : state === 'error' ? (
            /* §5.1: never $0.00 on failure — a cleaner reading zero believes it.
               Navy is retained so the screen keeps its shape. */
            <div role="alert">
              <p className="mt-1 text-[15px] font-extrabold text-[hsl(var(--pv-on-inverse))]">
                Couldn&rsquo;t load pay
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-link-on-inverse))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <p className="mt-0.5 text-[26px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-on-inverse))]">
                {JOB.pay}
              </p>
              <div className="mt-3 flex flex-col gap-1">
                {JOB.rate.map((r) => (
                  <PayWell key={r.label} label={r.label} value={r.value} />
                ))}
              </div>
            </>
          )}
        </InverseCard>

        {/* ── ContactCard ──────────────────────────────────────────────────── */}
        <Card>
          <CardTitle>Contact</CardTitle>
          {state === 'loading' ? (
            <div className="mt-3 flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="mt-1 h-2.5 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : state === 'error' ? (
            /* §5.1: a cleaner must not be told the customer has no phone when
               the read simply failed. */
            <div role="alert" className="mt-2">
              <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Couldn&rsquo;t load contact details
              </p>
              <button
                type="button"
                className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {JOB.contact.map((c) => (
                <InfoRow key={c.title} icon={c.icon} title={c.title} sub={c.sub} action={c.action} />
              ))}
            </div>
          )}
        </Card>

        {/* ── Note wells. Omitted when genuinely absent; warn tone on failure. */}
        {state === 'loading' ? (
          <>
            <Skeleton className="h-[86px] rounded-[10px]" />
            <Skeleton className="h-[72px] rounded-[10px]" />
          </>
        ) : state === 'error' ? (
          <>
            <NoteWellError
              label="Special instructions"
              message="Couldn't load instructions"
              onRetry={() => setState('ready')}
            />
            <NoteWellError
              label="Property notes"
              message="Couldn't load property notes"
              onRetry={() => setState('ready')}
            />
          </>
        ) : (
          <>
            <NoteWell tone="warn" label="Special instructions">
              {JOB.instructions}
            </NoteWell>
            <NoteWell tone="info" label="Property notes">
              {JOB.propertyNotes}
            </NoteWell>
          </>
        )}

        {/* ── ActionsCard ──────────────────────────────────────────────────── */}
        <Card>
          <CardTitle>Actions</CardTitle>
          <p className="mt-0.5 text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">
            Unlock Sun, Aug 16
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button
              variant="primary"
              className="rounded-[10px]"
              icon={<Navigation className="h-4 w-4" aria-hidden />}
            >
              On the way
            </Button>
            <Button
              variant="secondary"
              className="rounded-[10px]"
              icon={<MapPinned className="h-4 w-4" aria-hidden />}
            >
              Directions
            </Button>
            <Button variant="disabled-visible" className="rounded-[10px]">
              GPS check-in
            </Button>
            <Button
              variant="disabled-visible"
              className="rounded-[10px]"
              icon={<ClipboardList className="h-4 w-4" aria-hidden />}
            >
              Checklist
            </Button>
          </div>

          <Button variant="disabled-visible" size="lg" fullWidth className="mt-2.5">
            Start job
          </Button>

          <p className="mt-3 text-center text-[10.5px] font-medium tabular-nums text-[hsl(var(--pv-ink-3))]">
            Before photos: 0 <span className="mx-1 text-[hsl(var(--pv-ink-4))]">·</span> After: 0
          </p>
        </Card>
      </div>
    </main>
  );
}
