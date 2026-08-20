import { Clock, MapPin, Navigation, MapPinned } from 'lucide-react';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { PayWell } from './PayWell';
import { NoteWell } from './NoteWell';
import { Button } from './Button';

/**
 * §2 (2a): id+service title + StatusBadge -> meta lines -> PayWell (primaryTint
 * inset) -> NoteWell (warn, merged note) -> ButtonRow -> unlock caption.
 *
 * §3 rule 3: exactly one solid-primary action per zone, so "On the way" is the
 * only filled button here and Directions is outlined.
 * §3 rule 5: "Start job" renders disabled-but-legible with its unlock caption
 * rather than being hidden — cleaners plan around what unlocks later.
 *
 * No customer phone number, matching 3a: a cleaner should not be able to
 * contact a customer off-platform, and a tel: link would put the number back
 * into the DOM regardless of whether it is displayed.
 */
export function JobCard({
  job,
}: {
  job: {
    ref: string;
    service: string;
    status: { tone: 'info' | 'success' | 'warn' | 'danger'; label: string };
    time: string;
    area: string;
    pay: string;
    note?: string;
    unlockCaption: string;
  };
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
          {job.ref} · {job.service}
        </h3>
        <StatusBadge tone={job.status.tone} label={job.status.label} />
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-[hsl(var(--pv-ink-3))]">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="tabular-nums">{job.time}</span>
        </p>
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-[hsl(var(--pv-ink-3))]">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{job.area}</span>
        </p>
      </div>

      <PayWell label="Your pay" value={job.pay} className="mt-3" />

      {job.note && (
        <div className="mt-2.5">
          <NoteWell tone="warn" label="Note">
            {job.note}
          </NoteWell>
        </div>
      )}

      <div className="mt-3 flex gap-2.5">
        <Button
          variant="primary"
          className="flex-1 rounded-[10px]"
          icon={<Navigation className="h-4 w-4" aria-hidden />}
        >
          On the way
        </Button>
        <Button
          variant="secondary"
          className="flex-1 rounded-[10px]"
          icon={<MapPinned className="h-4 w-4" aria-hidden />}
        >
          Directions
        </Button>
      </div>

      <Button variant="disabled-visible" fullWidth className="mt-2.5">
        Start job
      </Button>

      <p className="mt-2 text-center text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">
        {job.unlockCaption}
      </p>
    </Card>
  );
}
