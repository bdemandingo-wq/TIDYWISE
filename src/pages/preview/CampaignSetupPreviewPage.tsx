import { useState } from 'react';
import {
  StepProgressBar,
  Card,
  CardTitle,
  SegmentedTabs,
  SettingsRow,
  Button,
  ChoiceRow,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screens 9d / 9e — Campaign setup, three steps.
 *
 * Preview route only, static data. Additive.
 *
 *   step 1  Audience & schedule — name, channel, target audience,
 *           duplicate-send filters
 *   step 2  Message builder — AI template generator, subject, body,
 *           placeholder reference
 *   step 3  Review & send — a summary of every choice, then the exclusions
 *
 * ── The exclusion line on step 3 is the important one ─────────────────
 *
 * "42 opted-out contacts excluded · skip contacted in last 90d · only
 * active clients". Three filters, stated on the screen where you press
 * send, listing who will NOT receive this. That is the right place for it:
 * the audience size on step 1 is a promise, and this is the reconciliation.
 * Anyone about to message hundreds of people should see the subtractions
 * before the button, not after.
 *
 * ── Duplicate-send filters are on step 1, not buried ──────────────────
 *
 * 9d puts "Exclude already received" and "Skip recently contacted" beside
 * the audience picker rather than in an advanced section. Choosing an
 * audience and choosing who to leave out of it are the same decision, and
 * the comp treats them that way.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * The recipient count is the number that matters and it must never be
 * guessed. If it cannot be computed the review step says so and Send is
 * disabled — sending to an unknown number of people is worse than not
 * sending. A campaign is not undoable once it leaves.
 */

type Step = 1 | 2 | 3;
type Channel = 'sms' | 'email' | 'both';
type Audience = 'active' | 'inactive' | 'leads' | 'all';

const AUDIENCE_LABEL: Record<Audience, string> = {
  active: 'Active Clients',
  inactive: 'Inactive Clients',
  leads: 'Leads',
  all: 'All Customers',
};

export default function CampaignSetupPreviewPage() {
  const [step, setStep] = useState<Step>(1);
  const [countKnown, setCountKnown] = useState(true);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>('email');
  const [audience, setAudience] = useState<Audience>('inactive');
  const [excludeReceived, setExcludeReceived] = useState(true);
  const [skipRecent, setSkipRecent] = useState(true);
  const [subject, setSubject] = useState('Your next cleaning is waiting!');
  const [body, setBody] = useState("Hi {first_name},\n\nWe'd love to have you back…");

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {([1, 2, 3] as Step[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (step === s
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            Step {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCountKnown(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
            (countKnown
              ? 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]'
              : 'bg-[hsl(var(--pv-danger))] text-[hsl(var(--pv-brand-ink))]')
          }
        >
          {countKnown ? 'Count known' : 'Count unknown'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {countKnown
            ? 'Step 3 reconciles the audience against every exclusion before the send button.'
            : 'Recipient count unreadable — Send is disabled. Sending to an unknown number is worse than not sending.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <header className="flex items-center gap-3 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          <button
            type="button"
            aria-label="Close"
            className="text-[15px] font-bold text-[hsl(var(--pv-ink-3))]"
          >
            ✕
          </button>
          <span className="text-[13.5px] font-extrabold text-[hsl(var(--pv-ink))]">
            {step === 1 ? 'Campaign setup' : step === 2 ? 'Message builder' : 'Review & send'}
            <span className="font-semibold text-[hsl(var(--pv-ink-3))]"> · step {step} of 3</span>
          </span>
        </header>

        <div className="px-5 pt-4">
          <StepProgressBar total={3} complete={step} label="Campaign setup progress" />
        </div>

        <div className="flex flex-col gap-3.5 px-5 pb-28 pt-4">
          {step === 1 && (
            <>
              <Card>
                <CardTitle>Audience &amp; schedule</CardTitle>
                <label className="mt-2.5 block">
                  <span className="text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">Campaign name</span>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g., Spring Cleaning Promo"
                    className="mt-1 h-11 w-full rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 text-[12.5px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                  />
                </label>

                <p className="mt-3 text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">Channel</p>
                <div className="mt-1">
                  <SegmentedTabs<Channel>
                    tabs={[
                      { id: 'sms', label: 'SMS' },
                      { id: 'email', label: 'Email' },
                      { id: 'both', label: 'Both' },
                    ]}
                    value={channel}
                    onChange={setChannel}
                    label="Campaign channel"
                  />
                </div>

                <p className="mt-3 text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">Target audience</p>
                <div className="mt-1 flex flex-col gap-2">
                  {(Object.keys(AUDIENCE_LABEL) as Audience[]).map(a => (
                    <ChoiceRow
                      key={a}
                      label={AUDIENCE_LABEL[a]}
                      selected={audience === a}
                      onClick={() => setAudience(a)}
                    />
                  ))}
                </div>
              </Card>

              {/* Beside the audience picker, not in an advanced section:
                  choosing an audience and choosing who to leave out of it
                  are the same decision. */}
              <Card>
                <CardTitle>Duplicate send filters</CardTitle>
                <div className="mt-1">
                  <SettingsRow
                    kind="toggle"
                    label="Exclude already received"
                    description="Skip clients who got this exact campaign."
                    checked={excludeReceived}
                    onCheckedChange={setExcludeReceived}
                  />
                  <SettingsRow
                    kind="toggle"
                    label="Skip recently contacted"
                    description="7 / 14 / 30 / 60 / 90 days."
                    checked={skipRecent}
                    onCheckedChange={setSkipRecent}
                  />
                </div>
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card>
                <CardTitle>AI template generator</CardTitle>
                <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                  Tones: Professional · Friendly · Urgent · Seasonal
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button variant="secondary" fullWidth className="rounded-[10px]">Friendly</Button>
                  <Button variant="primary" fullWidth className="rounded-[10px]">Generate</Button>
                </div>
              </Card>

              <Card>
                <CardTitle>Write your message</CardTitle>
                <label className="mt-2.5 block">
                  <span className="text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">Email subject</span>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="mt-1 h-11 w-full rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 text-[12.5px] font-medium text-[hsl(var(--pv-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                  />
                </label>
                <label className="mt-2.5 block">
                  <span className="text-[11px] font-bold text-[hsl(var(--pv-ink-3))]">Email body</span>
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={5}
                    className="mt-1 w-full resize-none rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 py-2.5 text-[12.5px] font-medium leading-[1.5] text-[hsl(var(--pv-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                  />
                </label>
                <p className="mt-2 text-[11px] font-normal leading-[1.5] text-[hsl(var(--pv-ink-3))]">
                  Placeholders: {'{first_name}'}, {'{last_name}'}, {'{company_name}'},{' '}
                  {'{booking_link}'}
                </p>
              </Card>
            </>
          )}

          {step === 3 && (
            <>
              <Card>
                <CardTitle>Review &amp; send</CardTitle>
                <div className="mt-1">
                  <SettingsRow kind="value" label="Name" value={name || 'Untitled campaign'} />
                  <SettingsRow
                    kind="value"
                    label="Channel"
                    value={channel === 'both' ? 'SMS + Email' : channel === 'sms' ? 'SMS' : 'Email'}
                  />
                  <SettingsRow kind="value" label="Audience" value={AUDIENCE_LABEL[audience]} />
                  <SettingsRow kind="value" label="Schedule" value="Fri, Aug 21 · 9:00 AM" />
                  <SettingsRow
                    kind="value"
                    label="Recipients"
                    /* Never guessed. If it cannot be computed it says so. */
                    value={countKnown ? '128' : '—'}
                  />
                </div>
              </Card>

              {/* The reconciliation, on the screen where you press send. The
                  audience on step 1 is a promise; this is who actually gets
                  it once every exclusion is applied. */}
              <Card>
                <div className="flex items-center gap-2">
                  <CardTitle>Who is excluded</CardTitle>
                  <StatusBadge tone="warn" label="3 filters" />
                </div>
                <ul className="mt-2 flex flex-col gap-1.5 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                  <li>42 opted-out contacts excluded</li>
                  <li>Skip contacted in last 90 days</li>
                  <li>Only active clients</li>
                </ul>
              </Card>

              {!countKnown && (
                <p role="alert" className="text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-danger))]">
                  We couldn&rsquo;t work out how many people this reaches. Sending
                  is blocked until we can — a campaign cannot be recalled once
                  it leaves.
                </p>
              )}
            </>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] gap-2 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          {step > 1 && (
            <Button
              variant="secondary"
              fullWidth
              className="rounded-[10px]"
              onClick={() => setStep((step - 1) as Step)}
            >
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              variant="primary"
              fullWidth
              className="rounded-[10px]"
              onClick={() => setStep((step + 1) as Step)}
            >
              Continue
            </Button>
          ) : (
            <Button
              variant={countKnown ? 'primary' : 'disabled-visible'}
              fullWidth
              className="rounded-[10px]"
            >
              {countKnown ? 'Send to 128' : 'Send'}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
