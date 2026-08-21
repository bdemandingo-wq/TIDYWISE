import { useState } from 'react';
import {
  SettingsGroup,
  SettingsRow,
  PortalHeader,
  DetailHeader,
  InverseHeader,
  StatWell,
  Card,
  CardTitle,
  Button,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screen 4f — /dashboard/settings at 390px.
 *
 * Preview route only, static data. Additive: the live SettingsPage is
 * untouched.
 *
 * ── This is a navigation problem, not a table problem ─────────────────
 *
 * Settings measured 1087px of hidden content — the second worst in the app —
 * but it has no table at all. Measuring what was actually scrolling found a
 * single element:
 *
 *     <div class="w-full overflow-x-auto ...">   clientWidth 330, scrollWidth 1417
 *     "General Team Booking Form Pricing Loyalty Notifications SMS Emails
 *      Integrations Reviews Branding Sidebar Mobile Nav Import Data Security
 *      Feedback Subscription"
 *
 * That is the tab strip. Seventeen destinations in a 330px window, so about
 * four are visible and thirteen are reachable only by dragging a strip whose
 * scrollbar is a few pixels tall. The content inside each tab stacks fine at
 * this width; it is finding the tabs that fails.
 *
 * So the fix is not a narrower table. It is the settings-index pattern: the
 * sections become a vertical list, grouped, each with the chevron that says
 * there is something behind it. Seventeen items is a short scroll and a long
 * horizontal drag.
 *
 * ── What gives ────────────────────────────────────────────────────────
 *
 *   - The tab strip itself. Nothing else can carry seventeen destinations at
 *     390px, and it is what was hiding them.
 *   - Seeing the active section and the section list at the same time. On
 *     desktop the strip stays above the panel; here you are either in the
 *     index or in a section. That is the real cost, and it is why each row
 *     carries a description — you should not need to open a section to
 *     remember what is in it.
 *
 * Nothing is dropped: all seventeen destinations are present, including
 * Subscription, which is not a tab at all — it is a trigger that calls
 * navigate('/dashboard/subscription'). It sits in the list with the others
 * because that is what it behaves like, and it is labelled as leaving.
 *
 * ── Where the descriptions come from ──────────────────────────────────
 *
 * Not from the tab names. Each section was opened in the browser and its
 * real card titles read off, because "General" and "Integrations" tell you
 * nothing about what is inside them. General turned out to hold the AI
 * co-pilot toggle and peer benchmarks; Integrations holds Stripe Connect
 * health and staff payouts. Descriptions name those.
 *
 * ── §5.1: navigation must not fail because a read did ─────────────────
 *
 * Two rows carry a live status hint — SMS reads "Disabled" and Integrations
 * counts staff without payout accounts. Those come from data, so they can
 * fail. When they do, the hint is dropped and the rows still render: a
 * settings index is how you get to the thing that fixes the problem, so it
 * must not be the thing that breaks. The hint area says so once, quietly,
 * rather than each row pretending it knows.
 */

type HintPhase = 'ready' | 'loading' | 'error' | 'offline';

type Section = {
  id: string;
  label: string;
  description: string;
  /** Only for sections whose live state is genuinely known. */
  hint?: string;
  leaves?: boolean;
};

/* Groups are ours; sections and their contents are the live page's. */
const GROUPS: { title: string; description?: string; sections: Section[] }[] = [
  {
    title: 'Your business',
    sections: [
      { id: 'general', label: 'General', description: 'Your profile, business details, peer benchmarks, AI co-pilot' },
      { id: 'team', label: 'Team', description: 'Invite teammates and manage who has access' },
      { id: 'branding', label: 'Branding', description: 'Colours and logo on your booking page' },
    ],
  },
  {
    title: 'Getting booked',
    sections: [
      { id: 'booking-form', label: 'Booking Form', description: 'Sharing, the embeddable widget, scheduling mode' },
      { id: 'pricing', label: 'Pricing', description: 'Rates, tax, recurring discounts, custom frequencies' },
      { id: 'loyalty', label: 'Loyalty', description: 'Customer tiers and their benefits' },
    ],
  },
  {
    title: 'Talking to customers',
    sections: [
      { id: 'notifications', label: 'Notifications', description: 'What sends an alert, for bookings, staff and customers' },
      { id: 'sms', label: 'SMS', description: 'OpenPhone connection and test messages', hint: 'Disabled' },
      { id: 'emails', label: 'Emails', description: 'Delivery settings and templates' },
      { id: 'reviews', label: 'Reviews', description: 'When and how review requests go out' },
    ],
  },
  {
    title: 'Money',
    sections: [
      { id: 'integrations', label: 'Integrations', description: 'Stripe Connect health and staff payouts', hint: '5 need setup' },
      { id: 'subscription', label: 'Subscription', description: 'Your plan, payment method and billing', leaves: true },
    ],
  },
  {
    title: 'This app',
    sections: [
      { id: 'sidebar', label: 'Sidebar', description: 'Which links show in the side navigation' },
      { id: 'mobile-nav', label: 'Mobile Nav', description: 'What sits in the bottom bar on a phone' },
      { id: 'import', label: 'Import Data', description: 'Bring customers and bookings from another platform' },
    ],
  },
  {
    title: 'Account',
    sections: [
      { id: 'security', label: 'Security', description: 'Change your password, or delete your account' },
      { id: 'feedback', label: 'Feedback', description: 'Send us a note about the app' },
    ],
  },
];

const PHASES: { id: HintPhase; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'All 17 destinations. Two carry a live hint: SMS "Disabled", Integrations "5 need setup".' },
  { id: 'loading', label: 'Loading', why: 'Rows are navigation and render immediately; only the hints are still coming.' },
  { id: 'error', label: 'Hints failed', why: 'Navigation survives a failed read. The hints drop and say so once, rather than each row guessing.' },
  { id: 'offline', label: 'Offline', why: 'Same principle: you can still reach every section, which is where the fix for being offline lives.' },
];

export default function SettingsPreviewPage() {
  const [phase, setPhase] = useState<HintPhase>('ready');
  /* Sections 5h–5p open behind the index rather than at routes of their
     own: they are one screen with a drill-in, exactly as the desktop tab
     strip was one screen with seventeen panels. */
  const [openId, setOpenId] = useState<string | null>(null);

  const hintsUnavailable = phase === 'error' || phase === 'offline';
  const hintFor = (s: Section) => {
    if (!s.hint) return '';
    if (phase === 'ready') return s.hint;
    return ''; // loading, error and offline all withhold rather than guess
  };

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Hints
        </span>
        {PHASES.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPhase(p.id)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (phase === p.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {p.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {PHASES.find(p => p.id === phase)?.why}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        {openId ? (
          <SectionBody id={openId} onBack={() => setOpenId(null)} />
        ) : (
        <>
        <PortalHeader eyebrow="Admin" greeting="Settings" name="Apple Reviewer" notifications={3} />

        <div className="flex flex-col gap-3 px-5 pb-10">
          {hintsUnavailable && (
            <p
              role="status"
              className="text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-3))]"
            >
              {phase === 'offline'
                ? "You're offline, so the status next to a few sections isn't shown. Every section still opens."
                : "Couldn't load the status next to a few sections. Every section still opens."}
            </p>
          )}

          {GROUPS.map(g => (
            <SettingsGroup key={g.title} title={g.title} state="ready">
              {g.sections.map(s => (
                <SettingsRow
                  key={s.id}
                  kind="value"
                  label={s.leaves ? `${s.label} →` : s.label}
                  description={s.description}
                  value={phase === 'loading' && s.hint ? '…' : hintFor(s)}
                  onClick={() => setOpenId(s.id)}
                />
              ))}
            </SettingsGroup>
          ))}
        </div>
        </>
        )}
      </main>
    </div>
  );
}

/**
 * One settings section, opened from the index. Every section shares the same
 * frame — a back header, an inverse summary carrying the numbers that section
 * is about, then its own controls — because the comps do: 5h leads with the
 * business and its timezone, 5i with the team head-count and its split, 5k
 * with the max recurring discount. The summary is not decoration; it answers
 * "what is this currently set to" before you read a single control.
 */
/* The real list, read off SidebarVisibilitySettings.tsx — 25 items, of which
   Dashboard and Help Videos carry `required: true` and are shown separately
   rather than as switches that refuse. Names are the live ones, not guesses:
   "AI Intelligence" and "Payment Setup" are easy to mis-title from memory. */
const SIDEBAR_ITEMS = [
  'Scheduler', 'Tracking', 'Bookings', 'Recurring', 'Customers', 'Messages',
  'Leads', 'Operations', 'Campaigns', 'Discounts', 'Feedback', 'Services',
  'Staff', 'Checklists', 'Inventory', 'Payroll', 'Expenses', 'Finance',
  'Reports', 'Notifications', 'AI Intelligence', 'Subscription',
  'Payment Setup',
];

type Summary = { label: string; value: string; wells: { value: string; caption: string }[] };

const SUMMARY: Record<string, Summary> = {
  general: { label: 'Business', value: 'TIDYWISE', wells: [{ value: 'GMT-4', caption: 'timezone' }, { value: 'USD', caption: 'currency' }] },
  team: { label: 'Team members', value: '11', wells: [{ value: '1', caption: 'owner' }, { value: '1', caption: 'manager' }, { value: '9', caption: 'cleaners' }] },
  'booking-form': { label: 'Public booking form', value: 'Live', wells: [{ value: 'Light', caption: 'theme' }, { value: 'Slots', caption: 'scheduling' }] },
  pricing: { label: 'Max recurring discount', value: '20%', wells: [{ value: '0%', caption: 'sales tax' }, { value: '4', caption: 'frequencies' }, { value: '0', caption: 'surge rules' }] },
  loyalty: { label: 'Loyalty program', value: 'Active', wells: [{ value: '3', caption: 'tiers' }, { value: '$1', caption: '= 1 point' }] },
  sms: { label: 'SMS via OpenPhone', value: 'Active', wells: [{ value: '742', caption: 'texts this month' }] },
  emails: { label: 'Sending from', value: 'Gmail', wells: [{ value: '~500', caption: 'per day' }] },
  reviews: { label: 'Google rating', value: '4.9', wells: [{ value: '138', caption: 'reviews' }, { value: '10', caption: 'requests sent' }, { value: '8%', caption: 'conversion' }] },
  branding: { label: 'Brand', value: 'TidyWise', wells: [{ value: '#2B5CE6', caption: 'primary' }, { value: '#14B8A6', caption: 'accent' }] },
  /* The five that had no comp. Built to the pattern the nine above establish:
     a summary answering "what is this set to now", then the controls. */
  sidebar: { label: 'Links in the sidebar', value: '21 of 25', wells: [{ value: '4', caption: 'hidden' }, { value: '2', caption: 'always on' }] },
  'mobile-nav': { label: 'Bottom bar', value: '4 of 4', wells: [{ value: '2', caption: 'left' }, { value: '2', caption: 'right' }] },
  import: { label: 'Imported so far', value: 'None', wells: [{ value: '2', caption: 'platforms' }] },
  security: { label: 'Password', value: 'Set', wells: [{ value: 'On', caption: 'org isolation' }] },
  feedback: { label: 'Goes to', value: 'The founder', wells: [{ value: 'Every one', caption: 'gets read' }] },
  /* 5q — Payouts / Stripe Connect health. Owed-to-cleaners leads because it is
     the number with a deadline attached; "2 blocked" is why it has not moved. */
  integrations: { label: 'Owed to cleaners', value: '$203.00', wells: [{ value: '2', caption: 'active' }, { value: '2', caption: 'incomplete' }, { value: '9', caption: 'not started' }] },
};

/* 5q's staff list.

   The comp shows four real cleaners with their real personal email addresses.
   Those are not going into a git repo — this one is on GitHub, the addresses
   belong to identifiable people, and a preview screen needs the SHAPE of an
   email, not a working one. Placeholders below; the statuses and the split
   (2 active, 2 incomplete, 9 not started) are the comp's.

   Statuses are live's own vocabulary: StripeConnectHealthPanel.tsx:130-132
   counts 'active', 'pending_verification' and 'onboarding'. */
const PAYOUT_STAFF: { name: string; email: string; status: 'active' | 'incomplete' }[] = [
  { name: 'Stephanie P.', email: 's.pickett@example.com', status: 'incomplete' },
  { name: 'Bruce D.', email: 'b.davis@example.com', status: 'incomplete' },
  { name: 'Laura G.', email: 'l.gomez@example.com', status: 'active' },
  { name: 'Antoinette L.', email: 'a.lafrance@example.com', status: 'active' },
];

function SectionBody({ id, onBack }: { id: string; onBack: () => void }) {
  const sum = SUMMARY[id];
  const title = GROUPS.flatMap(g => g.sections).find(s => s.id === id)?.label ?? 'Settings';

  const [smsOn, setSmsOn] = useState(true);
  const [gmail, setGmail] = useState(true);
  const [loyaltyOn, setLoyaltyOn] = useState(true);
  const [sqft, setSqft] = useState(false);
  /* 5u / 5v / 5w are a third level: index → section → sub-screen. Each comp
     shows a back arrow reading "Pricing", "SMS", "Booking form", so they open
     from inside a section rather than from the index. */
  const [sub, setSub] = useState<'frequencies' | 'sms-setup' | 'form-display' | null>(null);
  const [hiddenLinks, setHiddenLinks] = useState<string[]>(['Expenses', 'Checklists', 'Inventory', 'Discounts']);
  const [navSlots, setNavSlots] = useState<string[]>(['Bookings', 'Customers', 'Calendar', 'Leads']);

  if (!sum) {
    return (
      <>
        <DetailHeader title={title} onBack={onBack} />
        <div className="px-5 pt-4">
          <Card>
            <CardTitle>Not built yet</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
              This section has no comp and no pattern to follow. Saying so is
              better than inventing one.
            </p>
          </Card>
        </div>
      </>
    );
  }

  if (sub === 'frequencies') return <CustomFrequencies onBack={() => setSub(null)} />;
  if (sub === 'sms-setup') return <SmsSetupGuide onBack={() => setSub(null)} />;
  if (sub === 'form-display') return <FormDisplay onBack={() => setSub(null)} />;

  return (
    <>
      <DetailHeader title={title} onBack={onBack} />
      <InverseHeader
        eyebrow="Settings"
        business={title}
        revenueLabel={sum.label}
        revenue={sum.value}
        wells={sum.wells.map((w, i) => (
          <StatWell key={i} value={w.value} caption={w.caption} />
        ))}
      />

      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
        {id === 'general' && (
          <SettingsGroup title="Business information" state="ready">
            <SettingsRow kind="value" label="Business name" value="TIDYWISE" onClick={() => undefined} />
            <SettingsRow kind="value" label="Business email" value="support@tidywisecleaning.com" onClick={() => undefined} />
            <SettingsRow kind="value" label="Location" value="Deerfield Beach, FL" onClick={() => undefined} />
            <SettingsRow kind="value" label="Timezone" value="GMT-4" onClick={() => undefined} />
            <SettingsRow kind="value" label="Currency" value="USD" onClick={() => undefined} />
          </SettingsGroup>
        )}

        {id === 'team' && (
          <>
            <Card>
              <CardTitle>Invite a teammate</CardTitle>
              <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                They&rsquo;ll get an email to create their account.
              </p>
              <label className="mt-2.5 flex h-11 items-center rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3">
                <input
                  placeholder="coworker@company.com"
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none"
                />
              </label>
              <div className="mt-2">
                <SettingsRow kind="value" label="Role" value="Manager" onClick={() => undefined} />
                {/* The comp spells out what the role can see. A role name
                    alone tells you nothing about the money. */}
                <p className="mt-1 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                  Operations only — no financial data.
                </p>
              </div>
              <div className="mt-2.5">
                <Button variant="primary" className="rounded-[10px]">Send invite</Button>
              </div>
            </Card>

            <SettingsGroup title="Team members" state="ready">
              <SettingsRow kind="value" label="Apple Reviewer" value="Owner" onClick={() => undefined} />
              <SettingsRow kind="value" label="Laura Gomez" value="Manager" onClick={() => undefined} />
              <SettingsRow kind="value" label="Bruce Davis" value="Cleaner" onClick={() => undefined} />
            </SettingsGroup>
          </>
        )}

        {id === 'booking-form' && (
          <>
            <Card>
              <CardTitle>Share booking form</CardTitle>
              <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                Send a direct link or embed it on your site.
              </p>
              <p className="mt-2.5 truncate rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3 text-[12px] font-bold text-[hsl(var(--pv-brand))]">
                jointidywise.com/book/tidywise
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button variant="secondary" fullWidth className="rounded-[10px]">Copy link</Button>
                <Button variant="secondary" fullWidth className="rounded-[10px]">Preview</Button>
              </div>
            </Card>
            <SettingsGroup title="Form display" state="ready">
              <SettingsRow kind="value" label="Theme" value="Light" onClick={() => undefined} />
              <SettingsRow kind="value" label="Scheduling mode" value="Specific time slots" onClick={() => undefined} />
              <SettingsRow kind="value" label="Display & colours" value="6 set" onClick={() => setSub('form-display')} />
            </SettingsGroup>
          </>
        )}

        {id === 'pricing' && (
          <>
            <SettingsGroup title="Pricing & tax" state="ready">
              <SettingsRow
                kind="toggle"
                label="Show square footage on form"
                description="Off = price from bedroom/bathroom count only."
                checked={sqft}
                onCheckedChange={setSqft}
              />
              <SettingsRow kind="value" label="State sales tax" value="0%" onClick={() => undefined} />
            </SettingsGroup>
            <SettingsGroup title="Recurring discounts" description="Applied automatically to repeat schedules." state="ready">
              <SettingsRow kind="value" label="Weekly" value="20%" onClick={() => undefined} />
              <SettingsRow kind="value" label="Every 2 weeks" value="15%" onClick={() => undefined} />
              <SettingsRow kind="value" label="Monthly" value="10%" onClick={() => undefined} />
              <SettingsRow kind="value" label="Custom frequencies" value="4" onClick={() => setSub('frequencies')} />
            </SettingsGroup>
          </>
        )}

        {id === 'loyalty' && (
          <>
            <SettingsGroup title="Loyalty program" state="ready">
              <SettingsRow
                kind="toggle"
                label="Enable loyalty program"
                description="Points earned after each completed booking. Tier level is set by lifetime spend."
                checked={loyaltyOn}
                onCheckedChange={setLoyaltyOn}
              />
            </SettingsGroup>
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Tier benefits</CardTitle>
                <button type="button" className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]">
                  Edit tiers →
                </button>
              </div>
              <div className="mt-2">
                <SettingsRow kind="value" label="Silver" value="$0 – $999" />
                <SettingsRow kind="value" label="Gold" value="$1,000 – $2,999" />
                <SettingsRow kind="value" label="Platinum" value="$3,000+" />
              </div>
            </Card>
          </>
        )}

        {/* ── Sidebar ──────────────────────────────────────────────────
            25 links (SidebarVisibilitySettings.tsx), two of them
            `required: true` — Dashboard and Help Videos. A required item still
            renders a row, because leaving it out would make the list disagree
            with the sidebar it describes, but the row says WHY it cannot be
            turned off instead of offering a switch that silently refuses. */}
        {id === 'sidebar' && (
          <>
            <SettingsGroup
              title="Always shown"
              description="These two can’t be hidden — Dashboard is where every redirect lands, and Help Videos is how you get unstuck."
              state="ready"
            >
              <SettingsRow kind="value" label="Dashboard" value="Always on" />
              <SettingsRow kind="value" label="Help Videos" value="Always on" />
            </SettingsGroup>
            <SettingsGroup
              title="Show in the sidebar"
              description="Hiding a link doesn’t switch the feature off — the page still works if you have its address."
              state="ready"
            >
              {SIDEBAR_ITEMS.map(n => (
                <SettingsRow
                  key={n}
                  kind="toggle"
                  label={n}
                  checked={!hiddenLinks.includes(n)}
                  onCheckedChange={v =>
                    setHiddenLinks(h => (v ? h.filter(x => x !== n) : [...h, n]))
                  }
                />
              ))}
            </SettingsGroup>
            <Button variant="secondary" className="rounded-[10px]">Reset to default</Button>
          </>
        )}

        {/* ── Mobile Nav ───────────────────────────────────────────────
            Exactly four slots, named Left 1 / Left 2 / Right 1 / Right 2 in
            MobileBottomNavSettings.tsx:83, and the save path only accepts a
            set of four (`if (items.length === 4)`, :46). So this is not a
            "pick your favourites" list — it is four fixed positions, and
            choosing a page always displaces whatever held that slot. The
            screen says which slot it is filling and what it replaces. */}
        {id === 'mobile-nav' && (
          <>
            <Card>
              <CardTitle>What’s in the bottom bar</CardTitle>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                Four slots, two either side of the + button. Picking a page for
                a slot replaces what was there — it doesn’t add a fifth.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(['Left 1', 'Left 2', 'Right 1', 'Right 2'] as const).map((slot, i) => (
                  <div
                    key={slot}
                    className="rounded-[12px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[hsl(var(--pv-ink-3))]">
                      {slot}
                    </p>
                    <p className="mt-0.5 truncate text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
                      {navSlots[i]}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
            <SettingsGroup title="Change a slot" state="ready">
              {(['Left 1', 'Left 2', 'Right 1', 'Right 2'] as const).map((slot, i) => (
                <SettingsRow
                  key={slot}
                  kind="value"
                  label={slot}
                  value={navSlots[i]}
                  onClick={() =>
                    setNavSlots(s2 => {
                      const next = [...s2];
                      const pool = ['Bookings', 'Customers', 'Calendar', 'Leads', 'Invoices'];
                      next[i] = pool[(pool.indexOf(next[i]) + 1) % pool.length];
                      return next;
                    })
                  }
                />
              ))}
            </SettingsGroup>
          </>
        )}

        {/* ── Import Data ──────────────────────────────────────────────
            The live tab is one card and one button that navigates to
            /dashboard/import. The judgement here is that an import is the
            most destructive-feeling thing on this screen even though it only
            adds: people hesitate because they cannot tell whether it will
            duplicate what they already have. Saying so up front is the whole
            job of this section at 390px. */}
        {id === 'import' && (
          <>
            <Card>
              <CardTitle>Bring your data across</CardTitle>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                Customers, staff, bookings and services from BookingKoala or
                Jobber.
              </p>
              <div className="mt-2.5">
                <SettingsRow kind="value" label="BookingKoala" value="Supported" />
                <SettingsRow kind="value" label="Jobber" value="Supported" />
              </div>
              <p className="mt-2.5 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                Importing only adds records. Nothing you already have is
                changed or removed, and you can review everything before it
                lands.
              </p>
              <div className="mt-2.5">
                <Button variant="primary" className="rounded-[10px]">Open import wizard</Button>
              </div>
            </Card>
            <Card>
              <CardTitle>Imported so far</CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Nothing yet. When you run an import this is where the record of
                it lives.
              </p>
            </Card>
          </>
        )}

        {/* ── Security ─────────────────────────────────────────────────
            LIVE BUG, reproduced deliberately as the fix rather than the fault.

            SettingsPage.tsx:559 guards `if (!currentPassword || !newPassword ||
            !confirmPassword)` and :580 re-authenticates with currentPassword.
            But currentPassword is only ever `useState('')` at :308 — grep for
            `value={currentPassword}` returns nothing, and setCurrentPassword is
            never called anywhere. No input renders it.

            So the state is permanently empty, the guard always trips, and the
            change-password form CANNOT SUCCEED. Every attempt shows "Please
            fill in all password fields" while both visible fields are filled,
            which reads as a validation bug in the fields you can see.

            The re-authentication is right and should stay — changing a password
            without proving you know the old one is how a borrowed session
            becomes a stolen account. The missing piece is the field. */}
        {id === 'security' && (
          <>
            <Card>
              <CardTitle>Change password</CardTitle>
              <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                You’ll need your current password — it proves the session is
                yours before the change goes through.
              </p>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {/* The field the live form validates but never renders. */}
                <Field label="Current password" placeholder="Required" />
                <Field label="New password" placeholder="At least 6 characters" />
                <Field label="Confirm new password" placeholder="Type it again" />
              </div>
              <div className="mt-2.5">
                <Button variant="primary" className="rounded-[10px]">Update password</Button>
              </div>
            </Card>

            {/* Irreversible, and the one action on this screen where the
                consequence has to be stated before the tap rather than in a
                confirm dialog after it. */}
            <Card>
              <CardTitle>Delete this account</CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                This removes your account, your organisation and everything in
                it — bookings, customers, invoices and photos. It cannot be
                undone and support cannot restore it.
              </p>
              <div className="mt-2.5">
                <Button variant="secondary" className="rounded-[10px]">Delete account</Button>
              </div>
            </Card>
          </>
        )}

        {/* ── Feedback ─────────────────────────────────────────────────
            Not customer feedback — that is screen 10c. This is the owner
            writing to the person who builds TidyWise, so it is an outbound
            send, and the screen says where it goes and what happens next
            rather than leaving "Submit" to imply it. */}
        {id === 'feedback' && (
          <Card>
            <CardTitle>Send feedback</CardTitle>
            <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[hsl(var(--pv-ink-3))]">
              Suggestions, problems, and anything you like or don’t. It goes
              straight to the person building TidyWise — every one gets read.
            </p>
            <div className="mt-2.5 flex flex-col gap-2.5">
              <Field label="What’s on your mind?" placeholder="Type as much as you like" />
              <Field label="Email for a reply (optional)" placeholder="Leave blank and you won’t hear back" />
            </div>
            <div className="mt-2.5">
              <Button variant="primary" className="rounded-[10px]">Send feedback</Button>
            </div>
          </Card>
        )}

        {id === 'integrations' && (
          <>
            {/* The money is owed to real people and 2 of them are blocked by
                setup they have not finished, so the blocker is the headline
                rather than a footnote under a total. */}
            <Card>
              <CardTitle>2 cleaners can&rsquo;t be paid yet</CardTitle>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                Their Stripe payout setup is incomplete. Money owed to them stays
                held until they finish it — you can&rsquo;t push it through from
                here.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Staff payout status</CardTitle>
                <button type="button" className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]">
                  Refresh all →
                </button>
              </div>
              <div className="mt-2.5 flex flex-col gap-2.5">
                {PAYOUT_STAFF.map(p => (
                  <div key={p.email} className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">
                        {p.name}
                      </p>
                      <p className="truncate text-[11px] text-[hsl(var(--pv-ink-3))]">
                        {p.email}
                      </p>
                    </div>
                    <StatusBadge
                      tone={p.status === 'active' ? 'success' : 'warn'}
                      label={p.status === 'active' ? 'Active' : 'Incomplete'}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Without payout accounts</CardTitle>
                <button type="button" className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]">
                  View all 9 →
                </button>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
                Active staff who haven&rsquo;t started setup. They can still be
                assigned work — they just can&rsquo;t be paid through Stripe.
              </p>
            </Card>
          </>
        )}

        {id === 'sms' && (
          <>
            <SettingsGroup title="SMS notifications" state="ready">
              <SettingsRow
                kind="toggle"
                label="Enable SMS notifications"
                description="Confirmations and reminders to customers."
                checked={smsOn}
                onCheckedChange={setSmsOn}
              />
            </SettingsGroup>
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>API configuration</CardTitle>
                <button
                  type="button"
                  onClick={() => setSub('sms-setup')}
                  className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
                >
                  Setup guide →
                </button>
              </div>
              <div className="mt-2">
                {/* Never the key itself — "key on file" is the whole state
                    anyone needs, and rendering a secret to show it exists is
                    a bad trade. */}
                <SettingsRow kind="value" label="API key" value="•••••••• key on file" onClick={() => undefined} />
                <SettingsRow kind="value" label="From number" value="+1 813 735 6859" onClick={() => undefined} />
              </div>
              <div className="mt-2.5">
                <Button variant="secondary" className="rounded-[10px]">Send test SMS</Button>
              </div>
            </Card>
          </>
        )}

        {id === 'emails' && (
          <>
            <SettingsGroup title="Email delivery" state="ready">
              <SettingsRow
                kind="toggle"
                label="Send customer emails from Gmail"
                description="Emails come from your real address; replies land in your inbox."
                checked={gmail}
                onCheckedChange={setGmail}
              />
            </SettingsGroup>
            <Card>
              <CardTitle>Connected account</CardTitle>
              <div className="mt-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                  support@tidywisecleaning.com
                </span>
                <StatusBadge tone="success" label="Connected" />
              </div>
              {/* Carried verbatim: it answers "what happens if I turn this
                  off", which is the question the toggle raises. */}
              <p className="mt-2 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                System emails always send, whether or not Gmail is connected.
              </p>
            </Card>
          </>
        )}

        {id === 'reviews' && (
          <Card>
            <CardTitle>Review settings</CardTitle>
            <div className="mt-2">
              <SettingsRow kind="value" label="Google review URL" value="g.page/r/CR9k…" onClick={() => undefined} />
              <SettingsRow kind="value" label="Trigger" value="4+ stars" onClick={() => undefined} />
            </div>
            <p className="mt-2 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              When customers rate 4+ stars they&rsquo;re sent to Google. Lower
              ratings come to you instead.
            </p>
          </Card>
        )}

        {id === 'branding' && (
          <Card>
            <CardTitle>Brand customization</CardTitle>
            <div className="mt-2.5 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[hsl(var(--pv-sunken))] text-[15px] font-extrabold text-[hsl(var(--pv-ink))]">
                TW
              </span>
              <Button variant="secondary" className="rounded-[10px]">Upload logo</Button>
            </div>
            <p className="mt-1.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              PNG, JPG up to 2MB.
            </p>
            <div className="mt-2">
              {/* These hexes are DATA, not design tokens — the org picked
                  them and the screen exists to edit them. #2B5CE6 appearing
                  here is not the comp's blue leaking into the build. */}
              <SettingsRow kind="value" label="Primary color" value="#2B5CE6" onClick={() => undefined} />
              <SettingsRow kind="value" label="Accent color" value="#14B8A6" onClick={() => undefined} />
            </div>
            <p className="mt-1 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
              Primary is used for buttons and key actions; accent for
              highlights.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
/* ══════════════════════════════════════════════════════════════════════════
   5u — Pricing › Custom frequencies

   Measured: mode chips 11px at 6px 12px; a 1.4fr/.8fr field grid at 8px gap;
   fields radius 10 at 12px 13px, 12.5px text, labels 11.5px/700 5px above;
   the add row is fields + a nowrap 12.5px/800 button at 13px 20px.

   The comp's summary is "2 custom schedules · 1 active · 1 paused", and the
   pause state is the reason this screen needs one. A paused frequency still
   exists in this list but does NOT appear in the booking form, so a list that
   showed only names would make a paused schedule look live. Each row says
   which it is.
   ══════════════════════════════════════════════════════════════════════════ */
function CustomFrequencies({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'interval' | 'days'>('interval');

  return (
    <>
      <DetailHeader title="Custom frequencies" onBack={onBack} />
      <InverseHeader
        eyebrow="Pricing"
        business="Custom frequencies"
        revenueLabel="Custom schedules"
        revenue="2"
        wells={
          <>
            <StatWell value="1" caption="active" />
            <StatWell value="1" caption="paused" />
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
        <Card>
          <CardTitle>New frequency</CardTitle>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-[hsl(var(--pv-ink-3))]">
            Custom recurring intervals or day-of-week schedules with their own
            discount. These appear in the booking form.
          </p>

          <div className="mt-3 flex gap-1.5">
            {([
              ['interval', 'Every X days'],
              ['days', 'Specific days'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={
                  'rounded-full px-3 py-1.5 text-[11px] ' +
                  (mode === id
                    ? 'bg-[hsl(var(--pv-brand))] font-bold text-[hsl(var(--pv-brand-ink))]'
                    : 'font-semibold text-[hsl(var(--pv-ink-3))]')
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-[1.4fr_0.8fr] gap-2">
            <Field label="Name" placeholder="e.g. Every 3 Days" />
            <Field label={mode === 'interval' ? 'Interval (days)' : 'Days'} placeholder="3" />
          </div>

          <div className="mt-2.5 flex items-end gap-2">
            <div className="flex-1">
              <Field label="Discount %" placeholder="0" />
            </div>
            <Button variant="primary" className="shrink-0 whitespace-nowrap rounded-[10px]">
              + Add
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Your custom frequencies</CardTitle>
          <div className="mt-2.5 flex flex-col gap-2.5">
            {[
              { name: 'Mon/Wed/Fri', meta: 'Mon Wed Fri', paused: false },
              { name: 'Every 10 Days', meta: '10-day interval · 12% off', paused: true },
            ].map(f => (
              <div key={f.name} className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">
                    {f.name}
                  </p>
                  <p className="truncate text-[11.5px] text-[hsl(var(--pv-ink-3))]">
                    {f.meta}
                  </p>
                </div>
                {/* A paused frequency is still listed here but does NOT show
                    on the booking form. Without this the two look identical. */}
                <StatusBadge
                  tone={f.paused ? 'warn' : 'success'}
                  label={f.paused ? 'Paused' : 'On the form'}
                />
              </div>
            ))}
          </div>
        </Card>

        <Button variant="primary" fullWidth className="rounded-[12px]">
          Save changes
        </Button>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5v — SMS › OpenPhone setup guide & debug tools
   ══════════════════════════════════════════════════════════════════════════ */
function SmsSetupGuide({ onBack }: { onBack: () => void }) {
  return (
    <>
      <DetailHeader title="OpenPhone setup" onBack={onBack} />
      <InverseHeader
        eyebrow="SMS"
        business="OpenPhone setup"
        revenueLabel="Integration status"
        revenue="Connected"
        wells={<StatWell value="2:01 PM" caption="last check, Aug 20" />}
      />

      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
        <Card>
          <CardTitle>How to get your credentials</CardTitle>
          <div className="mt-3 flex flex-col gap-3">
            {[
              ['Create an OpenPhone account', 'Go to openphone.com and sign up.'],
              ['Get your API key', 'Settings → API, then create a new key.'],
              ['Find your phone number ID', 'Phone Numbers → click your number; the ID is in the URL.'],
            ].map(([title, body], i) => (
              <div key={title} className="flex gap-3">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pv-brand-soft))] text-[11px] font-extrabold text-[hsl(var(--pv-brand))]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">{title}</p>
                  <p className="text-[11.5px] leading-[1.45] text-[hsl(var(--pv-ink-3))]">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>SMS notifications include</CardTitle>
          <div className="mt-2 flex flex-col gap-1.5">
            {[
              'Booking confirmation texts to customers',
              'Appointment reminders before cleanings',
              'Schedule change notifications',
            ].map(t => (
              <p key={t} className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                <span className="mr-1.5 text-[hsl(var(--pv-success))]">✓</span>
                {t}
              </p>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <CardTitle>Debug tools</CardTitle>
            <button
              type="button"
              className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
            >
              Check config →
            </button>
          </div>
          <p className="mt-0.5 text-[11.5px] text-[hsl(var(--pv-ink-3))]">
            Test and troubleshoot your integration.
          </p>
          <div className="mt-2.5">
            <Field label="Send to" placeholder="(555) 123-4567" />
          </div>
          <p className="mt-2.5 rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3 text-[12px] leading-[1.45] text-[hsl(var(--pv-ink-2))]">
            This is a test message from TidyWise. If you received this,
            OpenPhone is working!
          </p>
          {/* This one really sends. The comp gives it the same weight as
              "Copy link"; naming the consequence before the tap is the rule
              this design system already applies to campaigns and discounts. */}
          <p className="mt-2 text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]">
            Sends a real text to that number and uses one message from your
            OpenPhone allowance.
          </p>
          <div className="mt-2">
            <Button variant="secondary" className="rounded-[10px]">Send test SMS</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   5w — Booking form › Display settings & custom colours

   Two divergences from the comp, both measured against the live component.

   1. SIX colour options, not five. FormDisplaySettings.tsx:78-85 defines
      form_bg_color, form_card_color, form_text_color, form_button_color,
      form_button_text_color AND form_accent_color — "Headings, borders, icons
      & highlights". The comp draws the first five. Accent is the one that
      colours headings, so leaving it out means the setting that changes the
      most visible thing on the page is the one you cannot find.

   2. Contrast is checked. Nothing in the live component validates any pair —
      grep for luminance/contrast/wcag/ratio in FormDisplaySettings returns
      zero. These colours are not applied to this admin screen; they are
      applied to the PUBLIC booking form, so an unreadable combination is
      inflicted on the customer trying to book, and the owner who picked it
      never sees the result. This repo already runs check-color-pairs.mjs over
      its own tokens for exactly this reason; a customer-facing palette
      deserves the same courtesy.

      The warning is advisory, not a block — it is their brand and they may
      have a reason. It states the ratio and what it affects.
   ══════════════════════════════════════════════════════════════════════════ */

/** Relative luminance / contrast, WCAG 2.1. Small and local on purpose. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const v = [0, 2, 4].map(i => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function FormDisplay({ onBack }: { onBack: () => void }) {
  const [sections, setSections] = useState<Record<string, boolean>>({
    'Service selection': true,
    'Add-ons & extras': true,
    'Square footage': false,
    'Promo code field': true,
  });

  /* Deliberately a failing pair by default so the check is visible in the
     preview: mid-grey text on a near-white page is 2.8:1. */
  const COLOURS = [
    { label: 'Background', description: 'Page background color', value: '#FBFBFD' },
    { label: 'Cards', description: 'Card and section backgrounds', value: '#F0F1F5' },
    { label: 'Text', description: 'Main text and headings', value: '#8A8F98' },
    { label: 'Buttons', description: 'Primary action buttons', value: '#2B5CE6' },
    { label: 'Button text', description: 'Text on buttons', value: '#FFFFFF' },
    /* The sixth, which the comp omits. */
    { label: 'Accent', description: 'Headings, borders, icons & highlights', value: '#0891B2' },
  ];

  const bg = COLOURS[0].value;
  const text = COLOURS[2].value;
  const btn = COLOURS[3].value;
  const btnText = COLOURS[4].value;

  const pairs = [
    { name: 'Text on background', ratio: contrast(text, bg) },
    { name: 'Button text on buttons', ratio: contrast(btnText, btn) },
  ].filter(p => p.ratio < 4.5);

  const shown = Object.values(sections).filter(Boolean).length;

  return (
    <>
      <DetailHeader title="Display settings" onBack={onBack} />
      <InverseHeader
        eyebrow="Booking form"
        business="Display settings"
        revenueLabel="Sections shown"
        revenue={String(shown)}
        wells={
          <>
            <StatWell value="Light" caption="theme" />
            <StatWell value={String(COLOURS.length)} caption="custom colors" />
          </>
        }
      />

      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-4">
        <SettingsGroup title="Sections on the form" state="ready">
          {Object.keys(sections).map(k => (
            <SettingsRow
              key={k}
              kind="toggle"
              label={k}
              checked={sections[k]}
              onCheckedChange={v => setSections(s => ({ ...s, [k]: v }))}
            />
          ))}
        </SettingsGroup>

        <Card>
          <div className="flex items-center gap-2">
            <CardTitle>Custom form colors</CardTitle>
            <button
              type="button"
              className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
            >
              Reset →
            </button>
          </div>

          {/* Advisory, not a block — it is their brand. But these colours are
              applied to the PUBLIC form, so the person who suffers an
              unreadable pair is the customer, and the owner never sees it. */}
          {pairs.length > 0 && (
            <div className="mt-2.5 rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5">
              <p className="text-[12px] font-bold text-[hsl(var(--pv-warn))]">
                Hard to read on your booking page
              </p>
              {pairs.map(p => (
                <p
                  key={p.name}
                  className="mt-0.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]"
                >
                  {p.name} is {p.ratio.toFixed(1)}:1. Small text needs 4.5:1.
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-3">
            {COLOURS.map(c => (
              <div key={c.label} className="flex items-center gap-3">
                <span
                  aria-hidden
                  style={{ background: c.value }}
                  className="h-[26px] w-[26px] shrink-0 rounded-full border border-[hsl(var(--pv-border))]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-[hsl(var(--pv-ink))]">
                    {c.label}
                  </p>
                  <p className="truncate text-[11px] text-[hsl(var(--pv-ink-3))]">
                    {c.description}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-[hsl(var(--pv-ink-3))]">
                  {c.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Button variant="primary" fullWidth className="rounded-[12px]">
          Save changes
        </Button>
      </div>
    </>
  );
}

/** The comp's field: 11.5px/700 label, 5px gap, radius 10, 12px 13px. */
function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div>
      <label className="block text-[11.5px] font-bold text-[hsl(var(--pv-ink-2))]">
        {label}
      </label>
      <input
        placeholder={placeholder}
        className="mt-[5px] w-full rounded-[10px] bg-[hsl(var(--pv-sunken))] px-[13px] py-3 text-[12.5px] text-[hsl(var(--pv-ink))] outline-none placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
      />
    </div>
  );
}
