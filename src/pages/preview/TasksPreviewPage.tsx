import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  SegmentedTabs,
  Card,
  CardTitle,
  ChecklistRow,
  Button,
} from '@/components/portal-v2';

/**
 * Screen 8f — Tasks & Notes.
 *
 * Preview route only, static data. Additive.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header  inverse; "Open tasks 9", "3 daily · 1 weekly · 5 monthly"
 *   tabs    Daily · Weekly · Monthly · Notes
 *   list    "Daily tasks — 3 remaining", then rows with a drag handle, a
 *           checkbox, the text, and edit/delete
 *   hint    "Double-click a task or note to edit inline. Drag the grip
 *           handle to reorder."
 *
 * ── The cadence is the structure ──────────────────────────────────────
 *
 * Tasks are grouped by how often they recur, not by project or assignee.
 * That is a real choice about this business: "Update Google LSA" is a
 * weekly chore, not a ticket, and the screen is a repeating checklist
 * rather than a tracker. The counts in the header split the same way,
 * which is what makes "9 open" legible — nine of what, on what rhythm.
 *
 * ── A count that means something ──────────────────────────────────────
 *
 * "3 remaining" beside the section title is not the total; it is what is
 * still open. On a list where finished items stay visible and struck
 * through, the distinction between "3 tasks" and "3 remaining" is the
 * whole point of the line.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A failed read renders "—" rather than 0 open tasks. "0 remaining" on a
 * Monday morning tells someone their week is clear, which is a claim about
 * their day rather than about the request.
 */

type Tab = 'daily' | 'weekly' | 'monthly' | 'notes';

const TASKS: Record<Exclude<Tab, 'notes'>, { id: string; text: string; done: boolean }[]> = {
  daily: [
    { id: 'd1', text: 'Update operations board', done: false },
    { id: 'd2', text: "Make sure to assign this week's jobs", done: false },
    { id: 'd3', text: 'Update Google LSA', done: false },
    { id: 'd4', text: 'Check overnight bookings', done: true },
  ],
  weekly: [{ id: 'w1', text: 'Reconcile payouts with Stripe', done: false }],
  monthly: [
    { id: 'm1', text: 'Review labour percentage by cleaner', done: false },
    { id: 'm2', text: 'Send 1099 reminders', done: false },
    { id: 'm3', text: 'Audit inactive customers', done: false },
    { id: 'm4', text: 'Renew supply orders', done: false },
    { id: 'm5', text: 'Check insurance expiry', done: false },
  ],
};

const NOTES = [
  { id: 'n1', title: 'Gate codes', body: 'Bayview: 4417. Cleary Blvd: call ahead, no code.' },
  { id: 'n2', title: 'Supplier', body: 'Chemicals from Deerfield Janitorial — Tue deliveries only.' },
];

export default function TasksPreviewPage() {
  const [tab, setTab] = useState<Tab>('daily');
  const [errored, setErrored] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      Object.values(TASKS).flat().map(t => [t.id, t.done]),
    ),
  );

  const m = (v: string) => (errored ? '—' : v);
  const list = tab === 'notes' ? [] : TASKS[tab];
  const remaining = list.filter(t => !done[t.id]).length;

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
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-brand-ink))]'
              : 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]')
          }
        >
          {errored ? 'Error' : 'Ready'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {errored
            ? 'Counts render "—". "0 remaining" on a Monday tells someone their week is clear.'
            : 'Grouped by cadence, not project — this is a repeating checklist, not a tracker.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Operations"
          business="Tasks & Notes"
          revenueLabel="Open tasks"
          revenue={m('9')}
          error={errored}
          wells={
            <>
              <StatWell value={m('3')} caption="daily" />
              <StatWell value={m('1')} caption="weekly" />
              <StatWell value={m('5')} caption="monthly" />
            </>
          }
        />

        <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
          <SegmentedTabs<Tab>
            tabs={[
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'notes', label: 'Notes' },
            ]}
            value={tab}
            onChange={setTab}
            label="Task cadence"
          />

          {tab === 'notes' ? (
            NOTES.map(n => (
              <Card key={n.id}>
                <CardTitle>{n.title}</CardTitle>
                <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  {n.body}
                </p>
              </Card>
            ))
          ) : (
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>{tab[0].toUpperCase() + tab.slice(1)} tasks</CardTitle>
                {/* Not the total — what is still open. On a list where done
                    items stay visible, that distinction is the whole line. */}
                <span className="ml-auto text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">
                  {errored ? '—' : `${remaining} remaining`}
                </span>
              </div>

              <div className="mt-2 flex flex-col">
                {list.map(t => (
                  <ChecklistRow
                    key={t.id}
                    label={t.text}
                    done={!!done[t.id]}
                    onClick={() => setDone(d => ({ ...d, [t.id]: !d[t.id] }))}
                  />
                ))}
              </div>

              <div className="mt-2.5">
                <Button variant="secondary" className="rounded-[10px]">Add task</Button>
              </div>
            </Card>
          )}

          <p className="px-1 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
            Double-tap a task or note to edit inline. Drag the grip handle to
            reorder.
          </p>
        </div>
      </main>
    </div>
  );
}
