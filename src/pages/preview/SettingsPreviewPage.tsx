import { useState } from 'react';
import { SettingsGroup, SettingsRow, PortalHeader } from '@/components/portal-v2';

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
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]'
                : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
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
                  onClick={() => undefined}
                />
              ))}
            </SettingsGroup>
          ))}
        </div>
      </main>
    </div>
  );
}
