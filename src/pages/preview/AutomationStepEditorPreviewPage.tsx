import { useState } from 'react';
import {
  Card,
  CardTitle,
  Eyebrow,
  SegmentedTabs,
  ChoiceRow,
  SettingsRow,
  Button,
  StatusBadge,
} from '@/components/portal-v2';

/**
 * Screen 5s — Edit Automation, step editor.
 *
 * Preview route only, static data. Additive. Opens from the Automation
 * Centre (5d).
 *
 * ── "Each step is one send" ───────────────────────────────────────────
 *
 * Four words, and they are the whole mental model of this screen. An
 * automation is not a message — it is a sequence, and every step in the
 * list will cost the business one SMS or one email per recipient. Without
 * that line "+ Add interval" reads as adding a setting rather than adding
 * a bill, which is exactly the misunderstanding that produces a five-step
 * reminder chain nobody meant to send.
 *
 * ── The audience switch sits inside the channel ───────────────────────
 *
 * Channel is SMS / Email / Both, and directly beside it: Client / Cleaner
 * / Owner. Who receives a step is a property OF that step, not of the
 * automation — the same reminder can text the client and email the owner.
 * Keeping the two rows adjacent is what makes that legible.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   header    title with a one-line description beneath, ✕ to close
 *   context   the automation's name in tracked caps, with "1 step · SMS to
 *             client" under it — what you are editing, and its current shape
 *   trigger   five choices, one selected
 *   step card numbered, deletable, with an interval (number + unit + before
 *             /after) and the message body
 *   counter   character count under the body, right-aligned
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * The character count is live and matters: an SMS over 160 characters
 * silently becomes two messages and costs twice. It is shown as a plain
 * count until 160, then flags — the screen states the consequence rather
 * than blocking the keystroke.
 */

type Trigger = 'before' | 'after' | 'lapse' | 'inactive' | 'holiday';
type Channel = 'sms' | 'email' | 'both';
type Audience = 'client' | 'cleaner' | 'owner';

const TRIGGERS: { id: Trigger; label: string }[] = [
  { id: 'before', label: 'Time before appointment' },
  { id: 'after', label: 'Time after appointment' },
  { id: 'lapse', label: 'Recurring lapse' },
  { id: 'inactive', label: 'Customer inactive' },
  { id: 'holiday', label: 'Holiday offset' },
];

export default function AutomationStepEditorPreviewPage() {
  const [trigger, setTrigger] = useState<Trigger>('before');
  const [channel, setChannel] = useState<Channel>('sms');
  const [audience, setAudience] = useState<Audience>('client');
  const [enabled, setEnabled] = useState(true);
  const [body, setBody] = useState(
    'Hi {customer_name}, thanks for booking with {company_name}!',
  );

  /* Over 160 an SMS silently becomes two and costs twice. Say so. */
  const overLimit = channel !== 'email' && body.length > 160;
  const segments = Math.ceil(body.length / 160) || 1;

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Try
        </span>
        <button
          type="button"
          onClick={() =>
            setBody(b =>
              b.length > 160
                ? 'Hi {customer_name}, thanks for booking with {company_name}!'
                : b + ' We look forward to seeing you and will text again the morning before your clean so nothing catches you out on the day.',
            )
          }
          className="rounded-full bg-[hsl(var(--pv-brand))] px-3 py-1 text-[11px] font-bold text-[hsl(var(--pv-brand-ink))]"
        >
          Toggle long message
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          Past 160 characters an SMS becomes two messages and costs twice. The
          screen says so rather than blocking the keystroke.
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <header className="flex items-start gap-3 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
              Edit automation
            </span>
            <span className="mt-[2px] block text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              Triggers, timing, message, and channel.
            </span>
          </span>
          <button type="button" aria-label="Close" className="text-[15px] font-bold text-[hsl(var(--pv-ink-3))]">
            ✕
          </button>
        </header>

        <div className="flex flex-col gap-3.5 px-5 pb-28 pt-4">
          <Card>
            <Eyebrow>Appointment reminders</Eyebrow>
            {/* What you are editing, and its current shape, before any control. */}
            <p className="mt-1 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
              1 step · SMS to client
            </p>
          </Card>

          <Card>
            <Eyebrow>Trigger</Eyebrow>
            <div className="mt-2 flex flex-col gap-2">
              {TRIGGERS.map(t => (
                <ChoiceRow
                  key={t.id}
                  label={t.label}
                  selected={trigger === t.id}
                  onClick={() => setTrigger(t.id)}
                />
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <CardTitle>Steps</CardTitle>
              <button type="button" className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]">
                + Add interval
              </button>
            </div>
            {/* The four words that make "+ Add interval" read as adding a
                bill rather than adding a setting. */}
            <p className="mt-0.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              Each step is one send.
            </p>

            <div className="mt-3 rounded-[12px] border border-[hsl(var(--pv-border))] p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-extrabold text-[hsl(var(--pv-ink))]">
                  New step #1
                </span>
                <button
                  type="button"
                  aria-label="Delete step"
                  className="ml-auto text-[12px] font-bold text-[hsl(var(--pv-danger))]"
                >
                  Delete
                </button>
              </div>

              <div className="mt-2">
                <SettingsRow kind="value" label="Interval" value="0 hours" onClick={() => undefined} />
                <SettingsRow kind="value" label="Relative to" value="After…" onClick={() => undefined} />
              </div>

              <div className="mt-3">
                <Eyebrow>Channel</Eyebrow>
                <div className="mt-1.5">
                  <SegmentedTabs<Channel>
                    tabs={[
                      { id: 'sms', label: 'SMS' },
                      { id: 'email', label: 'Email' },
                      { id: 'both', label: 'Both' },
                    ]}
                    value={channel}
                    onChange={setChannel}
                    label="Step channel"
                  />
                </div>
                {/* Directly beside the channel: who receives THIS step is a
                    property of the step, not of the automation. */}
                <div className="mt-2">
                  <SegmentedTabs<Audience>
                    tabs={[
                      { id: 'client', label: 'Client' },
                      { id: 'cleaner', label: 'Cleaner' },
                      { id: 'owner', label: 'Owner' },
                    ]}
                    value={audience}
                    onChange={setAudience}
                    label="Step recipient"
                  />
                </div>
              </div>

              <div className="mt-3">
                <Eyebrow>{channel === 'email' ? 'Email body' : 'SMS body'}</Eyebrow>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3 py-2.5 text-[12.5px] font-medium leading-[1.5] text-[hsl(var(--pv-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                />
                <div className="mt-[3px] flex items-center gap-2">
                  {overLimit && (
                    <StatusBadge tone="warn" label={`${segments} messages`} />
                  )}
                  <span className="ml-auto text-[10px] font-medium text-[hsl(var(--pv-ink-3))]">
                    {body.length} chars
                  </span>
                </div>
                {overLimit && (
                  <p className="mt-1 text-[11px] font-semibold leading-[1.5] text-[hsl(var(--pv-warn))]">
                    Over 160 characters, so this sends as {segments} SMS per
                    recipient and is billed as {segments}.
                  </p>
                )}
              </div>

              <div className="mt-3">
                <SettingsRow
                  kind="toggle"
                  label="Step enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[430px] gap-2 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          <Button variant="secondary" fullWidth className="rounded-[10px]">Cancel</Button>
          <Button variant="primary" fullWidth className="rounded-[10px]">Save</Button>
        </div>
      </main>
    </div>
  );
}
