import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  SegmentedTabs,
  PersonRow,
  PersonRowMenu,
  Card,
  CardTitle,
  StatusBadge,
  Button,
} from '@/components/portal-v2';

/**
 * Screens 7i / 7j — Client Portal admin: users and loyalty.
 *
 * Preview route only, static data. Additive. Both comps carry the same tab
 * row — Requests · Users · Loyalty — so they are one screen.
 *
 * ── A portal login is not a customer ──────────────────────────────────
 *
 * 7i counts "Customer logins 9" against an org with hundreds of customers.
 * Most customers never create a login, so this list is a small subset and
 * the header says so plainly rather than implying the customer base is
 * nine people. The distinction matters when someone wonders why the portal
 * looks empty.
 *
 * ── Loyalty points are a liability ────────────────────────────────────
 *
 * 7j leads with "Active points 153,233". That is not an achievement
 * metric — it is outstanding value the business has promised and not yet
 * settled. The tier split beneath it (3 platinum · 7 gold · 118 silver)
 * says where it is concentrated. Presenting the total first, before the
 * member count, is the comp's choice and the right one.
 *
 * "Add points" sits on every member row. Manually granting points writes
 * to that liability, so it is a per-row action with no bulk equivalent,
 * the same rule applied to "Opt back in" on campaigns.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Points render "—" on a failed read. A member shown with 0 points who
 * actually holds 38,792 will be told they have nothing to redeem, which is
 * an argument at the door rather than a display bug.
 */

type Tab = 'requests' | 'users' | 'loyalty';

const USERS = [
  { id: '1', name: 'David Miller', email: 'dave@davemillercpa.com', last: 'last login Aug 3', active: true },
  { id: '2', name: 'Bill Ohlsen', email: 'bill@crossfitwynwood.com', last: 'billcrossfit', active: true },
  { id: '3', name: 'Patrick Murphy', email: 'captainpatt@gmail.com', last: 'last login Jul 19', active: true },
  { id: '4', name: 'Marisol Reyes', email: 'marisol.reyes@outlook.com', last: 'never signed in', active: false },
];

const MEMBERS = [
  { id: '1', name: 'Eman Office', tier: 'Gold', points: 38792, lifetime: 38792 },
  { id: '2', name: 'Robert Washington', tier: 'Platinum', points: 26490, lifetime: 26490 },
  { id: '3', name: 'Bill Ohlsen', tier: 'Silver', points: 940, lifetime: 940 },
];

export default function PortalAdminPreviewPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [errored, setErrored] = useState(false);
  const m = (v: string) => (errored ? '—' : v);
  const pts = (n: number) => (errored ? '—' : n.toLocaleString('en-US'));

  const header =
    tab === 'loyalty'
      ? {
          label: 'Active points',
          value: m('153,233'),
          wells: (
            <>
              <StatWell value={m('128')} caption="members" />
              <StatWell value={m('3')} caption="platinum" />
              <StatWell value={m('7')} caption="gold" />
            </>
          ),
        }
      : tab === 'users'
        ? {
            label: 'Customer logins',
            value: m('9'),
            wells: (
              <>
                <StatWell value={m('8')} caption="active" />
                <StatWell value={m('1')} caption="inactive" />
              </>
            ),
          }
        : {
            label: 'Open requests',
            value: m('2'),
            wells: <StatWell value={m('0')} caption="overdue" />,
          };

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
            'rounded-full px-3 py-1 text-[11px] font-bold ' +
            (errored
              ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-brand-ink))]'
              : 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]')
          }
        >
          {errored ? 'Error' : 'Ready'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {errored
            ? 'Points render "—". A member shown with 0 who holds 38,792 gets told they have nothing to redeem.'
            : 'Active points are a LIABILITY — value promised and not yet settled — which is why 7j leads with the total.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Client Portal"
          business={tab === 'loyalty' ? 'Loyalty' : tab === 'users' ? 'Portal Users' : 'Requests'}
          revenueLabel={header.label}
          revenue={header.value}
          error={errored}
          wells={header.wells}
        />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-4">
          <SegmentedTabs<Tab>
            tabs={[
              { id: 'requests', label: 'Requests' },
              { id: 'users', label: 'Users' },
              { id: 'loyalty', label: 'Loyalty' },
            ]}
            value={tab}
            onChange={setTab}
            label="Client portal section"
          />

          {tab === 'users' && (
            <>
              {/* Says plainly that a login is a subset, so an empty-looking
                  portal is not mistaken for an empty customer base. */}
              <p className="px-1 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                Only customers who created a login appear here. Most customers
                never do, and they still get booking confirmations by email.
              </p>
              {USERS.map(u => (
                <PersonRow
                  key={u.id}
                  name={u.name}
                  inactive={!u.active}
                  lines={[u.email]}
                  facts={[u.last]}
                  badges={u.active ? undefined : [{ tone: 'info', label: 'Inactive' }]}
                  actions={<PersonRowMenu />}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}

          {tab === 'loyalty' &&
            MEMBERS.map(mem => (
              <Card key={mem.id}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                    {mem.name}
                  </span>
                  <StatusBadge
                    tone={mem.tier === 'Platinum' ? 'info' : mem.tier === 'Gold' ? 'warn' : 'success'}
                    label={mem.tier}
                  />
                </div>
                <p className="mt-[3px] text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                  {pts(mem.points)} pts · lifetime {pts(mem.lifetime)}
                </p>
                {/* Writes to the liability, so per-row only — no bulk grant. */}
                <div className="mt-2.5">
                  <Button variant="secondary" className="rounded-[10px]">Add points</Button>
                </div>
              </Card>
            ))}

          {tab === 'requests' && (
            <Card>
              <CardTitle>Open requests</CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                {errored
                  ? 'Couldn’t load requests.'
                  : 'Two booking requests from portal customers are waiting on a reply.'}
              </p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
