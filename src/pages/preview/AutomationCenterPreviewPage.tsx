import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  SegmentedTabs,
  Card,
  CardTitle,
  ProgressBar,
  StatusBadge,
  NoteWell,
} from '@/components/portal-v2';

/**
 * Screens 5d / 5e / 5f / 5g — Automation Center.
 *
 * Preview route only, static data. Additive.
 *
 * Four comps, ONE screen. 5d–5g are the four tabs — Automations, Messages,
 * Health, Suggestions — and the inverse header changes with the tab rather
 * than staying fixed. That is worth matching: each tab leads with the
 * number that tab is about (messages sent, templates, success rate,
 * customers to re-engage), so the header is part of the tab, not furniture
 * above it.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   card        radius 16, padding 16/18; title 13.5px/800
 *   breakdown   rows on 14px gaps, 14px below the title
 *   row head    name 12.5px/700; success chip 10.5px/800 on a tint,
 *               padding 3/9, pushed right
 *   bar         height 5, radius 99, track in sunken, 7px below the name
 *
 * ── The bar is coloured by its own rate ───────────────────────────────
 *
 * 5d gives each automation a bar tinted by how it is doing — Review
 * Requests at 8% reads red, Recurring Offers at 100% reads green. So
 * ProgressBar gained success/warn/danger alongside primary and gold. A
 * single brand-coloured bar would make a broken pipeline look like
 * progress.
 *
 * ── The line worth keeping verbatim ───────────────────────────────────
 *
 * 5e's Messages tab opens with: "Reword anything your customers receive.
 * Editing a message here never turns its automation on." That prevents a
 * specific and expensive misunderstanding — that editing a template
 * activates the automation behind it. It is carried exactly.
 *
 * ── §5.1, and the Health tab is entirely about it ─────────────────────
 *
 * 5f's alert is a model of this: "No reminder activity in the last 2
 * hours. Last log entry Aug 18, 12:16 PM. The scheduler runs every 15
 * minutes — if you have bookings in the next few days, contact support."
 * It states the observation, the evidence, the expected behaviour, and
 * what to do. It never claims the pipeline IS down — it says "may be
 * down", because absence of activity is evidence, not proof. Carried
 * verbatim for exactly that reason.
 */

type Tab = 'automations' | 'messages' | 'health' | 'suggestions';

const AUTOMATIONS = [
  { name: 'Review Requests', rate: 8, detail: '10 sent · 109 failed' },
  { name: 'Rebooking Reminders', rate: 90, detail: '18 sent · 2 failed · 36 pending' },
  { name: 'Recurring Offers', rate: 100, detail: '2 sent' },
  { name: 'Appointment Reminders', rate: 99, detail: '712 sent · 8 failed' },
];

const TEMPLATES = [
  {
    name: 'Booking confirmation',
    badge: 'Default',
    desc: 'Sent as soon as a booking is confirmed.',
    body: 'Hi {customer_name}! Your {service_name} appointment with {business_name} is confirmed for {date} at {time}.',
  },
  {
    name: 'Reminder — day before',
    badge: 'Customised',
    desc: 'Sent 24 hours before the clean.',
    body: 'Hi {customer_name}, just a reminder your clean is tomorrow at {time}. Reply here if anything changes.',
  },
];

const SUGGESTIONS = [
  {
    title: 'Enable 4 disabled automations',
    priority: 'high' as const,
    body: 'Disabled: AI SMS Reply, Recurring Upsell, Abandoned Booking Recovery, Review Request.',
    action: 'Review automations',
  },
  {
    title: 'Follow up with 145 inactive clients',
    priority: 'medium' as const,
    body: "Haven't booked in 60+ days. Send a win-back campaign with a loyalty discount.",
    action: 'Open campaigns',
  },
];

const rateTone = (r: number) => (r >= 90 ? 'success' : r >= 50 ? 'warn' : 'danger');

export default function AutomationCenterPreviewPage() {
  const [tab, setTab] = useState<Tab>('automations');
  const [errored, setErrored] = useState(false);
  const m = (v: string) => (errored ? '—' : v);

  const header: Record<Tab, { label: string; value: string; wells: React.ReactNode }> = {
    automations: {
      label: 'Messages sent',
      value: m('742'),
      wells: (
        <>
          <StatWell value={m('4')} caption="automations" />
          <StatWell value={m('119')} caption="failed" />
          <StatWell value={m('36')} caption="pending" />
        </>
      ),
    },
    messages: {
      label: 'Message templates',
      value: m('12'),
      wells: (
        <>
          <StatWell value={m('4')} caption="customised" />
          <StatWell value={m('8')} caption="default" />
        </>
      ),
    },
    health: {
      label: 'Success rate',
      value: m('86%'),
      wells: (
        <>
          <StatWell value={m('742')} caption="sent" />
          <StatWell value={m('119')} caption="failed" />
          <StatWell value={m('36')} caption="pending" />
        </>
      ),
    },
    suggestions: {
      label: 'Revenue opportunity',
      value: m('351'),
      wells: <StatWell value={m('2')} caption="suggestions" />,
    },
  };

  const h = header[tab];

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
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {errored
            ? 'Counts render "—". A 0% success rate and an unread one are different claims about whether your customers are being messaged.'
            : 'Four comps, one screen. The header changes with the tab — each tab leads with the number it is about.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Automation Center"
          business={
            tab === 'automations' ? 'Automations'
              : tab === 'messages' ? 'Messages'
                : tab === 'health' ? 'Health' : 'Suggestions'
          }
          revenueLabel={h.label}
          revenue={h.value}
          error={errored}
          wells={h.wells}
        />

        <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
          <SegmentedTabs<Tab>
            tabs={[
              { id: 'automations', label: 'Automations' },
              { id: 'messages', label: 'Messages' },
              { id: 'health', label: 'Health' },
              { id: 'suggestions', label: 'Suggestions' },
            ]}
            value={tab}
            onChange={setTab}
            label="Automation centre section"
          />

          {tab === 'automations' && (
            <Card>
              <CardTitle>Automation breakdown</CardTitle>
              <div className="mt-3.5 flex flex-col gap-3.5">
                {AUTOMATIONS.map(a => (
                  <div key={a.name}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                        {a.name}
                      </span>
                      {!errored && (
                        <StatusBadge tone={rateTone(a.rate)} label={`${a.rate}% success`} />
                      )}
                    </div>
                    {/* Coloured by its own rate: a brand-blue bar would make a
                        broken pipeline look like progress. */}
                    <div className="mt-[7px]">
                      <ProgressBar
                        value={errored ? 0 : a.rate}
                        tone={rateTone(a.rate)}
                        label={`${a.name} success rate`}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                      {errored ? 'Counts unavailable' : a.detail}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === 'messages' && (
            <>
              {/* Verbatim from 5e, and rendered as the comp has it — plain
                  body text above the templates, not a well. It prevents an
                  expensive misunderstanding: that editing a template turns
                  its automation on. */}
              <p className="px-1 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                Reword anything your customers receive. Editing a message here
                never turns its automation on.
              </p>
              {TEMPLATES.map(t => (
                <Card key={t.name}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                      {t.name}
                    </span>
                    <StatusBadge tone={t.badge === 'Default' ? 'info' : 'success'} label={t.badge} />
                  </div>
                  <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">{t.desc}</p>
                  <p className="mt-2.5 rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3 text-[11.5px] font-medium leading-[1.55] text-[hsl(var(--pv-ink-2))]">
                    {t.body}
                  </p>
                </Card>
              ))}
            </>
          )}

          {tab === 'health' && (
            <>
              {/* Verbatim from 5f. Note "may be down" — absence of activity is
                  evidence, not proof, and the copy is careful about it. */}
              <NoteWell tone="warn" label="Appointment reminder pipeline may be down">
                No reminder activity in the last 2 hours. Last log entry Aug 18,
                12:16 PM. The scheduler runs every 15 minutes — if you have
                bookings in the next few days, contact support.
              </NoteWell>
              <Card>
                <CardTitle>Delivery</CardTitle>
                <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                  {[
                    { v: m('742'), c: 'sent' },
                    { v: m('119'), c: 'failed' },
                    { v: m('36'), c: 'pending' },
                  ].map(x => (
                    <div key={x.c} className="rounded-[12px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3">
                      <p className="text-[18px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                        {x.v}
                      </p>
                      <p className="text-[10.5px] font-semibold text-[hsl(var(--pv-ink-3))]">{x.c}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {tab === 'suggestions' && (
            <>
              {SUGGESTIONS.map(s => (
                <Card key={s.title}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                      {s.title}
                    </span>
                    <StatusBadge
                      tone={s.priority === 'high' ? 'danger' : 'warn'}
                      label={s.priority}
                    />
                  </div>
                  <p className="mt-1.5 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                    {s.body}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
                  >
                    {s.action}
                  </button>
                </Card>
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
