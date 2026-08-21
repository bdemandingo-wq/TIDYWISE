import { useState } from 'react';
import {
  InverseHeader,
  StatWell,
  Card,
  StatusBadge,
  Button,
  SettingsRow,
  SettingsGroup,
} from '@/components/portal-v2';

/**
 * Screen 10c — Client Feedback.
 *
 * Preview route only, static data. Additive.
 *
 * ── A resolution is part of the record ────────────────────────────────
 *
 * Every resolved entry in the comp carries its outcome inline:
 * "Resolution: Called and explained; adjusted the price." Not a status
 * flag — the actual sentence describing what was done. That is what makes
 * this a log rather than a queue: six months later the useful artefact is
 * how a complaint was handled, not that it was closed.
 *
 * So a resolved item without a resolution is shown as incomplete rather
 * than done, because a tick with no story behind it is the thing that
 * makes the log worthless.
 *
 * ── "Show attention items" is the real default ────────────────────────
 *
 * 70 of 72 are resolved. A flat list buries the two that matter under
 * seventy that do not, which is why the comp offers the filter at the top
 * rather than in a menu. It is on by default here: the screen exists to
 * surface the unresolved.
 *
 * ── "Mark all resolved" needs care ────────────────────────────────────
 *
 * It is in the comp and it is kept, but it asks for confirmation naming
 * the count, and it cannot attach a resolution to anything. Bulk-closing
 * complaints without recording what was done is exactly how the log stops
 * being worth keeping — so the action exists, and it says what it costs.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * The unresolved count drives whether anyone looks at this screen today.
 * On a failed read it renders "—", never 0: "0 unresolved" is the one
 * answer that guarantees nobody checks.
 */

type Entry = {
  id: string;
  who: string;
  when: string;
  body: string;
  resolution: string | null;
  resolved: boolean;
  followUp: boolean;
};

const ENTRIES: Entry[] = [
  {
    id: '1',
    who: 'Robert Washington',
    when: 'Aug 20, 2026',
    body: 'Customer gave 5 star rating.',
    resolution: null,
    resolved: false,
    followUp: false,
  },
  {
    id: '2',
    who: 'Gary George',
    when: 'Aug 14, 2026',
    body: "Client did not communicate he doesn't want the service any more.",
    resolution: 'Called and explained; adjusted the price.',
    resolved: true,
    followUp: false,
  },
  {
    id: '3',
    who: 'Cleaner no-show',
    when: 'Aug 9, 2026',
    body: 'Cleaner no show last minute and no one is available to cover.',
    resolution: 'Client decided to cancel.',
    resolved: true,
    followUp: false,
  },
  {
    id: '4',
    who: 'Same-day rush service',
    when: 'Aug 2, 2026',
    body: 'Same day cleaning rush service. Client needed it before a viewing.',
    resolution: 'Called client and provided options; he took the later slot.',
    resolved: true,
    followUp: false,
  },
  {
    id: '5',
    who: 'Marisol Reyes',
    when: 'Jul 30, 2026',
    body: 'Reported a chipped tile in the bathroom after the clean.',
    /* Closed with nothing recorded — a tick with no story. */
    resolution: null,
    resolved: true,
    followUp: true,
  },
];

export default function FeedbackPreviewPage() {
  const [attentionOnly, setAttentionOnly] = useState(true);
  const [errored, setErrored] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const m = (v: string) => (errored ? '—' : v);

  const needsAttention = (e: Entry) => !e.resolved || !e.resolution;
  const shown = attentionOnly ? ENTRIES.filter(needsAttention) : ENTRIES;
  const unresolved = ENTRIES.filter(e => !e.resolved).length;

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
            ? 'Unresolved renders "—", never 0. "0 unresolved" is the one answer that guarantees nobody checks.'
            : '70 of 72 are resolved, so attention-only is the default — a flat list buries the two that matter.'}
        </p>
      </div>

      <main className="portal-v2 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
        <InverseHeader
          eyebrow="Quality"
          business="Client Feedback"
          revenueLabel="Total feedback"
          revenue={m('72')}
          error={errored}
          wells={
            <>
              <StatWell value={m('70')} caption="resolved" />
              <StatWell value={m(String(unresolved))} caption="unresolved" />
            </>
          }
        />

        <div className="flex flex-col gap-3 px-5 pb-10 pt-4">
          <SettingsGroup title="View" state="ready">
            <SettingsRow
              kind="toggle"
              label="Show attention items only"
              description="Unresolved, or resolved without a recorded resolution."
              checked={attentionOnly}
              onCheckedChange={setAttentionOnly}
            />
          </SettingsGroup>

          {shown.map(e => (
            <Card key={e.id}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">
                  {e.who}
                </span>
                <StatusBadge
                  tone={!e.resolved ? 'warn' : e.resolution ? 'success' : 'danger'}
                  label={!e.resolved ? 'Open' : e.resolution ? 'Resolved' : 'No resolution'}
                />
              </div>
              <p className="mt-[3px] text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                {e.when} · {e.followUp ? 'follow-up due' : 'no follow-up'}
              </p>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                {e.body}
              </p>

              {/* The outcome, inline. What makes this a log rather than a
                  queue — six months on, how it was handled is the artefact. */}
              {e.resolution ? (
                <p className="mt-2 rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  Resolution: {e.resolution}
                </p>
              ) : e.resolved ? (
                <p className="mt-2 text-[11.5px] font-semibold text-[hsl(var(--pv-danger))]">
                  Closed with no resolution recorded.
                </p>
              ) : null}
            </Card>
          ))}

          {/* Kept from the comp, but it names the count and cannot attach a
              resolution to anything — which is what it costs. */}
          {!confirming ? (
            <Button variant="secondary" fullWidth className="rounded-[10px]" onClick={() => setConfirming(true)}>
              Mark all resolved
            </Button>
          ) : (
            <Card>
              <p className="text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                Mark {errored ? 'all open' : `${unresolved}`} item
                {unresolved === 1 ? '' : 's'} resolved?
              </p>
              <p className="mt-1 text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                No resolution text is recorded for a bulk close, so these entries
                will show as resolved with nothing explaining how.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button variant="secondary" fullWidth className="rounded-[10px]" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button variant="primary" fullWidth className="rounded-[10px]" onClick={() => setConfirming(false)}>
                  Mark resolved
                </Button>
              </div>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
