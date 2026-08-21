import { useMemo, useState } from 'react';
import { ListShell, Card, Avatar, StatusBadge, type ListState } from '@/components/portal-v2';

/**
 * Screen 8d — Messages, inbox.
 *
 * Preview route only, static data. Additive. Pairs with 8e, the thread.
 *
 * ── Measured out of the comp ──────────────────────────────────────────
 *
 *   row card   radius 16, padding 14
 *   avatar     38px circle, tinted per person
 *   name row   name 13.5px/800 truncating, time 10.5px muted, baseline
 *   preview    11.5px muted, single line, truncating
 *   chip       10px/700 in warn ink on a warn tint, padding 3/9, radius 99,
 *              5px above
 *   unread     8px brand dot, 6px down, held out of the truncating column
 *
 * ── Why this row is not ListRow ───────────────────────────────────────
 *
 * It looked like a job for ListRow and is not. Two things differ in kind:
 * the timestamp sits on the TITLE baseline rather than in the trailing
 * money slot, and the unread dot is a fixed 8px column that must never be
 * squeezed by a long name. ListRow's trailing column is built for a money
 * figure and a stack of badges — forcing a dot and a time into it would
 * bend both. A thread row is its own shape.
 *
 * ── The preview line is the message, and it truncates ─────────────────
 *
 * This is the one place in this work where truncation is CORRECT rather
 * than a failure. A preview is by definition a fragment; the whole message
 * is one tap away. Everywhere else a truncated fact was a fact lost — here
 * the ellipsis is the point, and the comp truncates mid-address
 * ("Ladysparklecleaning@outlook.co…") without harm.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * "Needs reply · 5h" is a real, actionable state, not an error — it is the
 * screen's whole reason to exist. An unread count that could not load
 * renders no dot rather than a zero-state row, because a row that looks
 * read when it is not is worse than a row that looks unsure.
 */

type Tab = 'all' | 'clients' | 'cleaners' | 'unread';

type Thread = {
  id: string;
  name: string;
  time: string;
  preview: string;
  unread: boolean;
  needsReply?: string;
  kind: 'client' | 'cleaner';
};

const THREADS: Thread[] = [
  {
    id: '1',
    name: 'Renata Lady Sparkle Standard',
    time: '4:05 PM',
    preview: 'Email: Ladysparklecleaning@outlook.com',
    unread: true,
    needsReply: '5h',
    kind: 'cleaner',
  },
  {
    id: '2',
    /* No name — a number, as 8e's header also shows. */
    name: '+1 561 294 8993',
    time: '3:52 PM',
    preview: 'We have availability on the 10th from 10–4.',
    unread: false,
    kind: 'client',
  },
  {
    id: '3',
    name: 'Jared Lampkin',
    time: '2:14 PM',
    preview: "Hi Jared, how's the cleaning yesterday? Everything good?",
    unread: false,
    kind: 'client',
  },
  {
    id: '4',
    name: 'Sarah Salem',
    time: '11:20 AM',
    preview: 'Can we move Thursday to the following week?',
    unread: true,
    needsReply: '9h',
    kind: 'client',
  },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Two threads need a reply — a real actionable state, not an error.' },
  { id: 'loading', label: 'Loading', why: 'Skeletons rather than an empty inbox.' },
  { id: 'empty', label: 'Empty', why: 'No messages at all, distinct from a filter matching nothing.' },
  { id: 'error', label: 'Error', why: 'No unread dots render. A row that looks read when it is not is worse than one that looks unsure.' },
];

export default function MessagesInboxPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return THREADS.filter(t => {
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.preview.toLowerCase().includes(q);
      const matchesTab =
        tab === 'all' ||
        (tab === 'unread' && t.unread) ||
        (tab === 'clients' && t.kind === 'client') ||
        (tab === 'cleaners' && t.kind === 'cleaner');
      return matchesSearch && matchesTab;
    });
  }, [search, tab]);

  const errored = state === 'error';
  const filtered = search.trim().length > 0 || tab !== 'all';
  const effective: ListState = state === 'ready' && rows.length === 0 ? 'empty' : state;

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: THREADS.length },
    { id: 'clients', label: 'Clients', count: THREADS.filter(t => t.kind === 'client').length },
    { id: 'cleaners', label: 'Cleaners', count: THREADS.filter(t => t.kind === 'cleaner').length },
    { id: 'unread', label: 'Unread', count: THREADS.filter(t => t.unread).length },
  ];

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {STATES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setState(s.id)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (state === s.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]'
                : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {s.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Messages"
          action={{ label: 'New' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search messages…"
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            filtered
              ? {
                  title: 'Nothing matches that',
                  hint: 'Try a different name, or another tab.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
              : { title: 'No messages yet', hint: 'Texts and emails with clients and cleaners will show here.' }
          }
          errorLabel="Couldn't load messages"
          onRetry={() => setState('ready')}
          skeletonRows={5}
        >
          {state === 'ready' && (
            <Card className="mb-0.5">
              <p className="text-[12px] font-extrabold text-[hsl(var(--pv-ai))]">
                AI inbox summary · 1 urgent
              </p>
              <p className="mt-[3px] text-[11.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                Reply first to Sarah Salem (cancellation confirmation needed) and
                Laura Gomez (oldest customer, needs a quote).
              </p>
            </Card>
          )}

          {rows.map(t => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-start gap-3 rounded-[16px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-3.5 text-left"
            >
              <Avatar name={t.name} />

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-[hsl(var(--pv-ink))]">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                    {t.time}
                  </span>
                </span>

                {/* The one place truncation is correct: a preview IS a
                    fragment, and the message is one tap away. */}
                <span className="mt-[1px] block truncate text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
                  {t.preview}
                </span>

                {t.needsReply && !errored && (
                  <span className="mt-[5px] inline-block">
                    <StatusBadge tone="warn" label={`Needs reply · ${t.needsReply}`} />
                  </span>
                )}
              </span>

              {/* Fixed column, never squeezed by a long name. Suppressed on a
                  failed read rather than guessed. */}
              {t.unread && !errored && (
                <span
                  aria-label="Unread"
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--pv-brand))]"
                />
              )}
            </button>
          ))}
        </ListShell>
      </div>
    </div>
  );
}
