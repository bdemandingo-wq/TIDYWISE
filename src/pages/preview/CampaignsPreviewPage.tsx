import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  SegmentedTabs,
  Card,
  StatusBadge,
  ListRow,
} from '@/components/portal-v2';

/**
 * Screens 9c / 9f — Campaigns: overview, library, and opted-out contacts.
 *
 * Preview route only, static data. Additive. 9d/9e are the three-step setup
 * wizard and are a separate screen.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header   inverse; "Campaigns sent 0", "0 delivered · 0% conversion";
 *            wells for active / opted out / referrals
 *   tabs     Campaigns · Opted Out 42 · Referrals
 *   filters  All / Draft / Active / Sent, inside the Campaigns tab
 *   row      name, channel and send count as meta, status badge, kebab
 *
 * ── Zero is the honest number here ────────────────────────────────────
 *
 * The comp ships showing "Campaigns sent 0 · 0 delivered · 0% conversion"
 * against three ACTIVE campaigns. That is not an empty state and not a
 * failure — it is a business that has set campaigns up and not sent any
 * yet. Carried as-is, because softening it would misrepresent the account.
 * A failed read still renders "—", so the two stay distinguishable.
 *
 * ── The opted-out tab is compliance, not a list ───────────────────────
 *
 * 9f's copy: "42 replied STOP or manually excluded. These contacts will
 * not receive any future campaign sends." Both halves matter. The first
 * says how someone got there — replying STOP is a legal signal, not a
 * preference toggle — and the second states the guarantee plainly.
 *
 * Every row offers "Opt back in", which is the one action that must never
 * be casual: it re-subscribes someone who explicitly left. It stays a
 * per-row action with no bulk equivalent, exactly as the comp has it.
 */

type Tab = 'campaigns' | 'opted-out' | 'referrals';
type Filter = 'all' | 'draft' | 'active' | 'sent';

const CAMPAIGNS = [
  { name: 'Holiday Cleaning Reminder', channel: 'SMS', sent: 0, status: 'Active' },
  { name: 'VIP Client Offer', channel: 'SMS', sent: 0, status: 'Active' },
  { name: 'Recurring Service Offer', channel: 'SMS', sent: 0, status: 'Active' },
  { name: 'Spring Refresh', channel: 'Email', sent: 128, status: 'Sent' },
  { name: 'Win-back 60 days', channel: 'SMS', sent: 0, status: 'Draft' },
];

const OPTED_OUT = [
  { name: 'Rental Authority', contact: '5613127894', how: 'Manual', when: 'May 14, 2026' },
  { name: 'Robert Washington', contact: '+1 510 646 5090', how: 'Manual', when: 'May 14, 2026' },
  { name: 'Sarah Mahoney', contact: '+1 304 840 3540', how: 'Manual', when: 'May 14, 2026' },
  { name: 'Reagan Alvarez', contact: '+1 786 210 4477', how: 'Replied STOP', when: 'Jun 2, 2026' },
];

export default function CampaignsPreviewPage() {
  const [tab, setTab] = useState<Tab>('campaigns');
  const [filter, setFilter] = useState<Filter>('all');
  const [errored, setErrored] = useState(false);
  const m = (v: string) => (errored ? '—' : v);

  const rows = CAMPAIGNS.filter(c => filter === 'all' || c.status.toLowerCase() === filter);

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
            ? 'Counts render "—". A real 0 sent and an unreadable one are different claims.'
            : '"0 sent" against three ACTIVE campaigns is the comp\'s own honest number, not an empty state.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Marketing"
          business="Campaigns"
          revenueLabel="Campaigns sent"
          revenue={m('0')}
          error={errored}
          wells={
            <>
              <StatWell value={m('3')} caption="active" />
              <StatWell value={m('42')} caption="opted out" />
              <StatWell value={m('3')} caption="referrals" />
            </>
          }
        />

        <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
          <SegmentedTabs<Tab>
            tabs={[
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'opted-out', label: `Opted Out ${errored ? '' : '42'}`.trim() },
              { id: 'referrals', label: 'Referrals' },
            ]}
            value={tab}
            onChange={setTab}
            label="Campaigns section"
          />

          {tab === 'campaigns' && (
            <>
              <SegmentedTabs<Filter>
                tabs={[
                  { id: 'all', label: 'All' },
                  { id: 'draft', label: 'Draft' },
                  { id: 'active', label: 'Active' },
                  { id: 'sent', label: 'Sent' },
                ]}
                value={filter}
                onChange={setFilter}
                label="Campaign status filter"
              />

              {rows.map(c => (
                <ListRow
                  key={c.name}
                  title={c.name}
                  meta={`${c.channel} · ${errored ? '—' : c.sent} sent`}
                  status={[
                    {
                      tone: c.status === 'Active' ? 'success' : c.status === 'Draft' ? 'info' : 'warn',
                      label: c.status,
                    },
                  ]}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}

          {tab === 'opted-out' && (
            <>
              <Card>
                <p className="text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                  Excluded contacts
                </p>
                {/* Both halves of this matter — how they got here, and the
                    guarantee. Replying STOP is a legal signal, not a
                    preference toggle. */}
                <p className="mt-1 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  {errored ? '—' : '42'} replied STOP or manually excluded. These
                  contacts will not receive any future campaign sends.
                </p>
              </Card>

              {OPTED_OUT.map(o => (
                <Card key={o.contact}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                        {o.name}
                      </span>
                      <span className="mt-[3px] block truncate text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                        {o.contact} · {o.how} · {o.when}
                      </span>
                    </span>
                    {o.how === 'Replied STOP' && (
                      <StatusBadge tone="danger" label="STOP" />
                    )}
                  </div>
                  {/* Per-row only. Re-subscribing someone who explicitly left
                      must never be a bulk action, and the comp has no bulk
                      equivalent either. */}
                  <button
                    type="button"
                    className="mt-2 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
                  >
                    Opt back in
                  </button>
                </Card>
              ))}
            </>
          )}

          {tab === 'referrals' && (
            <Card>
              <p className="text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                Referral program
              </p>
              <p className="mt-1 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                {errored ? 'Couldn’t load referrals.' : '3 referrals so far. Customers who refer a friend get a credit on their next clean.'}
              </p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
