import { useState } from 'react';
import { SimpleListView, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * Every state of the conversation list that /dashboard/messages-v2 renders.
 *
 * This preview carries more weight than the others: sms_conversations and
 * sms_messages are BOTH EMPTY on the live org, so the ready state cannot be
 * seen anywhere else. Everything below is fabricated, and the phone numbers
 * are 555 numbers on purpose — no real customer number belongs in a repo.
 *
 * Shaped around what the schema and the live code make possible:
 *
 *   - A conversation whose number matches no contact, which is the ordinary
 *     case for an inbound text from a stranger.
 *   - A cleaner, because staff numbers are matched first (MessagesPage:475
 *     is if/else-if with staff > customer > lead, which is the right order).
 *   - A name with a doubled space, which is what `${first} ${last}` produces
 *     on this data and what MessagesPage:461 renders today.
 *   - "Names unavailable", the state the live screen cannot express at all:
 *     it checks only convsRes.error and reads the other three as
 *     `(res.data || [])`, so a failed customers read empties every name and
 *     shows a list of anonymous numbers with no error.
 */

const ROWS: SimpleListRow[] = [
  {
    id: '1',
    title: 'Laura Gomez',
    meta: '(555) 0100',
    lines: ['Aug 21, 9:14 AM', 'Cleaner'],
    badges: [{ tone: 'warn', label: '2 unread' }],
  },
  {
    id: '2',
    /* Collapsed from "apple " + " client". The live screen renders the double
       space; customerDisplayName removes it. */
    title: 'apple client',
    meta: '(555) 0142',
    lines: ['Aug 20, 4:02 PM', 'Client'],
  },
  {
    id: '3',
    /* No contact match — the number IS the title, and the meta says why. */
    title: '(555) 0188',
    meta: 'Not in your contacts',
    lines: ['Aug 19, 11:30 AM', 'Client'],
    badges: [{ tone: 'warn', label: '1 unread' }],
  },
];

/* The same three with names stripped — what a failed contacts read looks like. */
const NAMELESS: SimpleListRow[] = ROWS.map((r, i) => ({
  ...r,
  title: ['(555) 0100', '(555) 0142', '(555) 0188'][i],
  meta: 'Name unavailable',
}));

const STATES: { id: ListState | 'no-names'; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'A cleaner (staff numbers match first), a client whose doubled-space name has been collapsed, and a number matching no contact — which says so rather than looking like a missing name.' },
  { id: 'no-names', label: 'Contacts failed', why: 'The state the live screen cannot express. It checks only convsRes.error and reads the other three as (res.data || []), so a failed customers read empties every name and renders anonymous numbers with no error at all.' },
  { id: 'empty', label: 'Empty', why: 'No conversations. This is the TRUE state of the live org — both SMS tables are empty, which is why this preview exists.' },
  { id: 'loading', label: 'Loading', why: 'Skeletons.' },
  { id: 'error', label: 'Error / offline', why: 'Conversations could not be read at all. Distinct from having none.' },
];

export default function MessagesStatesPreviewPage() {
  const [state, setState] = useState<ListState | 'no-names'>('ready');
  const [search, setSearch] = useState('');

  const rows =
    state === 'ready' ? ROWS : state === 'no-names' ? NAMELESS : [];
  const phase: ListState = state === 'no-names' ? 'ready' : state;

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
              'rounded-full px-3 py-1 text-[11px] font-bold ' +
              (state === s.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
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
        <SimpleListView
          title="Messages"
          phase={phase}
          rows={rows}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or number..."
          emptyTitle="No conversations yet"
          emptyHint="Texts to and from customers and cleaners will show here."
          errorLabel="Couldn't load conversations"
          addLabel="New message"
          onRetry={() => setState('ready')}
          note={
            state === 'no-names'
              ? "Couldn't match numbers to your contacts, so some conversations show a phone number instead of a name. The conversations themselves are complete."
              : undefined
          }
          sectionLabel={`${rows.length} conversation${rows.length === 1 ? '' : 's'}`}
        />
      </div>
    </div>
  );
}
