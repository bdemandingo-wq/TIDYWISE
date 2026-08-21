import { useState } from 'react';
import { MessageBubble, Avatar, Button } from '@/components/portal-v2';

/**
 * Screen 8e — Messages, conversation.
 *
 * Preview route only, static data. Additive.
 *
 * ── A shape the system genuinely did not have ─────────────────────────
 *
 * Of the four things my inventory called "REAL DESIGN", three dissolved on
 * contact with the comps — the scheduler is a month grid, tracking has no
 * map, charts are one sparkline. This one did not. A conversation is a
 * shape nothing else in the app resembles, and MessageBubble is a new
 * component rather than an assembly of existing ones.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   thread    padding 16/20, column, 9px gaps
 *   bubble    max-width 78%, padding 11/14, text 12.5px at lh 1.5
 *   inbound   card surface + hairline, radius 16 16 16 5
 *   outbound  brand fill, radius 16 16 5 16, timestamp on-brand at 60%
 *   time      9.5px, 3px below the text
 *
 * The asymmetric corner IS the tail — no arrow, no pseudo element, one
 * corner at 5px on the side the message came from. Worth keeping exactly:
 * it is what makes a stack of bubbles read as a conversation rather than a
 * list of cards.
 *
 * ── The header carries a fact the inbox needs ─────────────────────────
 *
 * "Client · lead from Google" — the person is identified by their SOURCE,
 * not just their name, and the thread is headed by a phone number because
 * that is all this contact has. It matches what 8h and 7g show: this
 * business talks to people who are not customers yet, and often has no
 * name for them.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A message that failed to send must never look delivered. `status` is a
 * separate field from `time` precisely so a failure can say "Failed"
 * rather than borrowing a timestamp it does not have, and it renders in
 * danger ink rather than as a quieter "Delivered".
 */

type Phase = 'ready' | 'sending' | 'failed';

const PHASES: { id: Phase; label: string; why: string }[] = [
  { id: 'ready', label: 'Delivered', why: 'A normal thread. Outbound messages carry "· Delivered".' },
  { id: 'sending', label: 'Sending', why: 'The last message is in flight — stated, not assumed delivered.' },
  { id: 'failed', label: 'Failed', why: 'A failed send in danger ink. It must never look like a quieter Delivered.' },
];

const THREAD: { dir: 'in' | 'out'; text: string; time: string }[] = [
  { dir: 'in', text: 'I am with patience. i can not talk', time: '3:18 PM' },
  {
    dir: 'out',
    text: "No worries, Deep clean for that size is $450 but we are giving $75 discount for new customers so it's just going to be $375",
    time: '3:21 PM',
  },
  { dir: 'out', text: 'When are you looking to book? This month or next month?', time: '3:42 PM' },
  { dir: 'in', text: 'Next month, I just got a cleaning', time: '3:45 PM' },
  { dir: 'in', text: '2nd week', time: '3:49 PM' },
  { dir: 'out', text: 'We have availability on the 10th from 10–4.', time: '3:52 PM' },
];

export default function ConversationPreviewPage() {
  const [phase, setPhase] = useState<Phase>('ready');
  const [draft, setDraft] = useState('');

  const statusFor = (i: number, dir: 'in' | 'out'): 'Delivered' | 'Sending' | 'Failed' | undefined => {
    if (dir === 'in') return undefined;
    const isLast = i === THREAD.length - 1;
    if (!isLast) return 'Delivered';
    if (phase === 'sending') return 'Sending';
    if (phase === 'failed') return 'Failed';
    return 'Delivered';
  };

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
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
        <header className="flex items-center gap-3 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          <Avatar name="93" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-extrabold text-[hsl(var(--pv-ink))]">
              +1 561 294 8993
            </span>
            {/* Identified by source, not name — this contact has no name. */}
            <span className="block truncate text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
              Client · lead from Google
            </span>
          </span>
        </header>

        <div className="flex flex-1 flex-col gap-[9px] px-5 py-4">
          {THREAD.map((mmm, i) => (
            <MessageBubble
              key={`${mmm.time}-${i}`}
              direction={mmm.dir}
              time={mmm.time}
              status={statusFor(i, mmm.dir)}
            >
              {mmm.text}
            </MessageBubble>
          ))}

          {phase === 'failed' && (
            <button
              type="button"
              className="self-end text-[11px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              Try again
            </button>
          )}
        </div>

        <div className="sticky bottom-0 flex items-end gap-2 border-t border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-5 py-3">
          <textarea
            rows={1}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Message…"
            className="min-h-[40px] flex-1 resize-none rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-bg))] px-3.5 py-2.5 text-[12.5px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
          />
          {/* Nothing to send while the draft is empty — said before the tap. */}
          <Button
            variant={draft.trim() ? 'primary' : 'disabled-visible'}
            className="shrink-0 rounded-[16px]"
          >
            Send
          </Button>
        </div>
      </main>
    </div>
  );
}
