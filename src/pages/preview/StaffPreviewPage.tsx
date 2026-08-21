import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  SegmentedTabs,
  PersonRow,
  PersonRowMenu,
  Card,
  CardTitle,
  SettingsRow,
  Button,
  StatusBadge,
  DetailHeader,
} from '@/components/portal-v2';

/**
 * Screens 10g / 10h — Staff: team & compliance, and edit member.
 *
 * Preview route only, static data. Additive. 10h opens from a row on 10g.
 *
 * ── "2 payout issues" belongs in the header ───────────────────────────
 *
 * 10g's summary is "17 staff · 15 active · 2 inactive · 2 payout issues".
 * The last one is not a demographic — it is two people who will not get
 * paid. Putting it beside the head-count is what makes it impossible to
 * miss, and it is why the row carries a badge rather than leaving the
 * problem to the payouts screen.
 *
 * ── The rate is financial data ────────────────────────────────────────
 *
 * Rows read "$25/hr · 1099 · +1 954 831 9023". The pay rate sits on the
 * list, so this screen is gated by financial access and masks in test mode
 * — the redacted rate renders as "$XX/hr" rather than disappearing, so a
 * hidden rate stays distinguishable from an unset one. Same rule PersonRow
 * was built around.
 *
 * ── 10h: the W-9 upload says who can see it ───────────────────────────
 *
 * "PDF, JPG, or PNG. Max 10MB. Admin-only access." That last sentence is
 * about a tax document containing someone's SSN, and it belongs next to
 * the button rather than in a policy page. Carried verbatim.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A payout-issue count renders "—" on a failed read, never 0. "0 payout
 * issues" tells an owner everyone will be paid on Friday, which is the
 * single most costly thing this screen could get wrong.
 */

type Tab = 'team' | 'documents' | 'activity' | 'timeoff';

type Member = {
  id: string;
  name: string;
  rate: number | null;
  tax: 'W-2' | '1099';
  contact: string;
  active: boolean;
  payoutIssue: boolean;
};

const STAFF: Member[] = [
  { id: '1', name: 'Antoinette LaFrance', rate: 25, tax: '1099', contact: '+1 954 831 9023', active: true, payoutIssue: false },
  { id: '2', name: 'Bruce Davis', rate: 25, tax: '1099', contact: 'peanut2jr@icloud.com', active: true, payoutIssue: false },
  { id: '3', name: 'Laura Gomez', rate: 27, tax: 'W-2', contact: '+1 561 402 1188', active: true, payoutIssue: true },
  { id: '4', name: 'Stephanie Pickett', rate: 30, tax: '1099', contact: 'steph.p@gmail.com', active: true, payoutIssue: true },
  /* Deactivated, and no rate set — two different absences on one row. */
  { id: '5', name: 'Marcus Ellery', rate: null, tax: '1099', contact: 'm.ellery@outlook.com', active: false, payoutIssue: false },
];

export default function StaffPreviewPage() {
  const [tab, setTab] = useState<Tab>('team');
  const [open, setOpen] = useState<Member | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [errored, setErrored] = useState(false);

  const m = (v: string) => (errored ? '—' : v);
  /* Redacted renders as a shape, never disappears — a hidden rate must stay
     distinguishable from one that was never set. */
  const rate = (r: number | null) =>
    r === null ? 'No rate set' : testMode ? '$XX/hr' : `$${r}/hr`;

  if (open) {
    return (
      <div>
        <StateBar
          testMode={testMode}
          setTestMode={setTestMode}
          errored={errored}
          setErrored={setErrored}
          onBack={() => setOpen(null)}
          note="10h. The W-9 upload states who can see the file, next to the button."
        />
        <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
          <DetailHeader title={`Edit: ${open.name}`} onBack={() => setOpen(null)} />
          <div className="flex flex-col gap-3.5 px-5 pb-10 pt-1">
            <Card>
              <CardTitle>Details</CardTitle>
              <div className="mt-1">
                <SettingsRow kind="value" label="Full name *" value={open.name} onClick={() => undefined} />
                <SettingsRow kind="value" label="Tax class" value={open.tax} onClick={() => undefined} />
                <SettingsRow kind="value" label="Hourly rate" value={rate(open.rate)} onClick={() => undefined} />
                <SettingsRow kind="value" label="Calendar color" value="Blue" onClick={() => undefined} />
              </div>
            </Card>

            <Card>
              <CardTitle>W-9 form (tax document)</CardTitle>
              <div className="mt-2.5">
                <Button variant="secondary" className="rounded-[10px]">Upload W-9 form</Button>
              </div>
              {/* Verbatim. It is about a document carrying someone's SSN, so
                  it belongs beside the button, not in a policy page. */}
              <p className="mt-1.5 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                PDF, JPG, or PNG. Max 10MB. Admin-only access.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Uploaded documents</CardTitle>
                <span className="ml-auto">
                  <StatusBadge tone="success" label="2 approved" />
                </span>
              </div>
              <div className="mt-2">
                <SettingsRow kind="value" label="W-9" value="Approved" onClick={() => undefined} />
                <SettingsRow kind="value" label="Government ID" value="Approved" onClick={() => undefined} />
              </div>
            </Card>

            <Card>
              <CardTitle>Time off</CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                No time off booked.
              </p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>
      <StateBar
        testMode={testMode}
        setTestMode={setTestMode}
        errored={errored}
        setErrored={setErrored}
        note={
          errored
            ? 'Payout issues render "—", never 0. "0 issues" says everyone gets paid Friday.'
            : '"2 payout issues" sits beside the head-count — two people who will not get paid.'
        }
      />

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Team"
          business="Staff"
          revenueLabel="All staff"
          revenue={m('17')}
          error={errored}
          wells={
            <>
              <StatWell value={m('15')} caption="active" />
              <StatWell value={m('2')} caption="inactive" />
              {/* Not a demographic — two people who will not get paid. */}
              <StatWell value={m('2')} caption="payout issues" />
            </>
          }
        />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-4">
          <SegmentedTabs<Tab>
            tabs={[
              { id: 'team', label: 'Team' },
              { id: 'documents', label: 'Documents' },
              { id: 'activity', label: 'Activity' },
              { id: 'timeoff', label: 'Time Off' },
            ]}
            value={tab}
            onChange={setTab}
            label="Staff section"
          />

          {tab === 'team' &&
            STAFF.map(s => (
              <PersonRow
                key={s.id}
                name={s.name}
                inactive={!s.active}
                lines={[s.contact]}
                facts={[rate(s.rate), s.tax]}
                badges={
                  s.payoutIssue && !errored
                    ? [{ tone: 'danger', label: 'Payout issue' }]
                    : undefined
                }
                actions={<PersonRowMenu />}
                onClick={() => setOpen(s)}
              />
            ))}

          {tab !== 'team' && (
            <Card>
              <CardTitle>
                {tab === 'documents' ? 'Documents' : tab === 'activity' ? 'Activity' : 'Time off'}
              </CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                {tab === 'activity'
                  ? '38 entries in the last 30 days.'
                  : tab === 'documents'
                    ? '2 staff have documents awaiting review.'
                    : 'No time off booked this month.'}
              </p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function StateBar({
  testMode,
  setTestMode,
  errored,
  setErrored,
  onBack,
  note,
}: {
  testMode: boolean;
  setTestMode: (v: boolean) => void;
  errored: boolean;
  setErrored: (v: boolean) => void;
  onBack?: () => void;
  note: string;
}) {
  return (
    <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
        State
      </span>
      <button
        type="button"
        onClick={() => setErrored(!errored)}
        className={
          'rounded-full px-3 py-1 text-[11px] font-bold ' +
          (errored
            ? 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-on-brand))]'
            : 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]')
        }
      >
        {errored ? 'Error' : 'Ready'}
      </button>
      <button
        type="button"
        onClick={() => setTestMode(!testMode)}
        className={
          'rounded-full px-3 py-1 text-[11px] font-bold ' +
          (testMode
            ? 'bg-[hsl(var(--pv-gold))] text-[hsl(var(--pv-gold-ink))]'
            : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
        }
      >
        Test mode {testMode ? 'on' : 'off'}
      </button>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-[hsl(var(--pv-card))] px-3 py-1 text-[11px] font-bold text-[hsl(var(--pv-ink-2))]"
        >
          ← List
        </button>
      )}
      <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
        {testMode ? 'Redacted rate renders "$XX/hr" — a hidden rate must stay distinct from an unset one.' : note}
      </p>
    </div>
  );
}
