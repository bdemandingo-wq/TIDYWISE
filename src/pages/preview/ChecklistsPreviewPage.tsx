import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  ListRow,
  Card,
  CardTitle,
  ChecklistRow,
  Button,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screen 11a — Cleaning Checklists.
 *
 * Preview route only, static data. Additive.
 *
 * ── A template is bound to a service ──────────────────────────────────
 *
 * Every row reads "11 items · assigned to Move In/Out Clean". A checklist
 * is not free-floating: it attaches to a service type, and that binding is
 * what makes it appear on the right job. A template assigned to nothing
 * never reaches a cleaner, so the assignment is shown on the row rather
 * than hidden in an editor — an unassigned template should be visibly
 * useless.
 *
 * ── "0 photo-suggested items" is a capability, not a count ────────────
 *
 * The header carries it beside the template count. It means no item on any
 * template currently asks the cleaner for a photo. That is worth surfacing
 * because photo-suggested items are how a dispute gets settled later, and
 * zero of them is a quiet risk rather than a neutral fact.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * An item count that could not be read renders "—". "0 items" on a
 * template says the cleaner will be handed an empty list, which is a
 * different and more alarming thing than "we could not count them".
 */

type Template = {
  id: string;
  name: string;
  items: number;
  service: string | null;
  photos: number;
  active: boolean;
};

const TEMPLATES: Template[] = [
  { id: '1', name: 'Move in/out Checklist', items: 11, service: 'Move In/Out Clean', photos: 0, active: true },
  { id: '2', name: 'Airbnb Clean Home Checklist', items: 10, service: 'Airbnb Turnover', photos: 0, active: true },
  { id: '3', name: 'Deep Clean Home Checklist', items: 14, service: 'Deep Clean', photos: 0, active: true },
  /* Assigned to nothing — it exists but reaches no cleaner. */
  { id: '4', name: 'Post-Construction Draft', items: 6, service: null, photos: 0, active: true },
];

const SAMPLE_ITEMS = [
  'Wipe skirting boards',
  'Inside all cupboards',
  'Clean oven interior',
  'Descale shower screen',
  'Vacuum and mop all floors',
];

export default function ChecklistsPreviewPage() {
  const [open, setOpen] = useState<Template | null>(null);
  const [errored, setErrored] = useState(false);
  const m = (v: string) => (errored ? '—' : v);

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        <button
          type="button"
          onClick={() => setErrored(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
            (errored
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-on-brand))]'
              : 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]')
          }
        >
          {errored ? 'Error' : 'Ready'}
        </button>
        {open && (
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="rounded-full bg-[hsl(var(--pv-card))] px-3 py-1 text-[11px] font-bold text-[hsl(var(--pv-ink-2))]"
          >
            ← Back
          </button>
        )}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {errored
            ? 'Item counts render "—". "0 items" says the cleaner gets an empty list.'
            : 'Every template shows what service it is assigned to — one assigned to nothing reaches no cleaner.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Quality"
          business={open ? open.name : 'Cleaning Checklists'}
          revenueLabel={open ? 'Items' : 'Templates'}
          revenue={open ? m(String(open.items)) : m('4')}
          error={errored}
          wells={
            open ? (
              <StatWell value={m(String(open.photos))} caption="photo-suggested" />
            ) : (
              <>
                <StatWell value={m('4')} caption="active" />
                {/* A capability, not a count — zero is a quiet risk. */}
                <StatWell value={m('0')} caption="photo-suggested items" />
              </>
            )
          }
        />

        <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
          {open ? (
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Items</CardTitle>
                {open.service ? (
                  <span className="ml-auto">
                    <StatusBadge tone="info" label={open.service} />
                  </span>
                ) : (
                  <span className="ml-auto">
                    <StatusBadge tone="warn" label="Not assigned" />
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col">
                {SAMPLE_ITEMS.map(i => (
                  <ChecklistRow key={i} label={i} done={false} />
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button variant="secondary" fullWidth className="rounded-[10px]">Add item</Button>
                <Button variant="secondary" fullWidth className="rounded-[10px]">Suggest photo</Button>
              </div>
            </Card>
          ) : (
            TEMPLATES.map(t => (
              <ListRow
                key={t.id}
                title={t.name}
                meta={errored ? '— items' : `${t.items} items`}
                lines={[
                  t.service ? `Assigned to ${t.service}` : 'Not assigned to any service',
                ]}
                status={
                  t.service
                    ? [{ tone: 'success', label: 'Active' }]
                    : /* Visibly useless rather than quietly inert. */
                      [{ tone: 'warn', label: 'Reaches no one' }]
                }
                onClick={() => setOpen(t)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
