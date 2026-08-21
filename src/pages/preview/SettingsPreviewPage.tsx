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
};

function SectionBody({ id, onBack }: { id: string; onBack: () => void }) {
  const sum = SUMMARY[id];
  const title = GROUPS.flatMap(g => g.sections).find(s => s.id === id)?.label ?? 'Settings';

  const [smsOn, setSmsOn] = useState(true);
  const [gmail, setGmail] = useState(true);
  const [loyaltyOn, setLoyaltyOn] = useState(true);
  const [sqft, setSqft] = useState(false);

  if (!sum) {
    return (
      <>
        <DetailHeader title={title} onBack={onBack} />
        <div className="px-5 pt-4">
          <Card>
            <CardTitle>No comp for this section</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
              Sidebar, Mobile Nav, Import Data, Security and Feedback have no
              comp in the set of 76. Saying so is better than inventing one.
            </p>
          </Card>
        </div>
      </>
    );
  }

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
              <SettingsRow kind="value" label="Custom frequencies" value="4" onClick={() => undefined} />
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
                <button type="button" className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]">
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