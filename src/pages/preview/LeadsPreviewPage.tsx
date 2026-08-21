import { useMemo, useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, type ListState } from '@/components/portal-v2';

/**
 * Screen 4c — /dashboard/leads at 390px.
 *
 * Preview route only, static data. Additive: the live LeadsPage is untouched.
 * Built from the DESKTOP table (LeadsPage.tsx), which has eight columns.
 *
 *   Name       CARRIED, with its tags. Tags are user-authored {name, color}
 *              objects, not an enum — normalizeTags() accepts a bare string
 *              too and defaults the colour to slate.
 *   Contact    CARRIED in full — email and phone on one line.
 *   Interest   CARRIED (`service_interest`), with the desktop's '-' fallback.
 *   Source     CARRIED, but see the divergence below.
 *   Status     CARRIED via the STATUS_CONFIG labels.
 *   Notes      CARRIED on its own line, with the desktop's "No notes".
 *   Created    CARRIED as 'MMM d, yyyy'.
 *   Actions    The kebab GIVES WAY to the row tap, as on bookings.
 *
 * What gives at 390px: the status cell is a dropdown on desktop — you change
 * a lead's status inline from the table. Here it is a badge, and changing it
 * needs the row tap. The status is still shown; only the shortcut goes.
 *
 * ── Recurring pattern 1: slugs where labels were assumed ──────────────
 *
 * Found, and this time the live screen has it backwards. The Source cell
 * renders `{lead.source}` RAW, so the table shows "website", "facebook",
 * "google" in lower case — while SOURCE_OPTIONS, defined a few lines above
 * in the same file, already carries "Website", "Facebook", "Google" and is
 * used to label the filter dropdown. So the filter says "Facebook" and the
 * column it filters says "facebook".
 *
 * This screen renders the label. That is a deliberate divergence from what
 * desktop displays, not from what it means: the fact is identical, the
 * presentation is the one the same file already defines. Worth folding back
 * into the live table, and it is a one-line change there.
 *
 * ── Recurring pattern 2: single-row helpers ───────────────────────────
 *
 * One `.single()` (line 189), on an INSERT ... .select(). It returns the row
 * just inserted, so it cannot match several. Clean.
 *
 * ── §5.1: the live screen has no error state ──────────────────────────
 *
 * Third instance of the same bug. LeadsPage:150 is
 * `const { data: leads = [], isLoading } = useQuery(...)` — the queryFn
 * throws correctly at line 159, but `error` is never destructured, so a
 * failed read renders "No leads found" to a business that has leads. Same
 * shape as OnboardingProgress and CustomersPage. Carried here as a real
 * state; fixing the live page is its own change.
 */

type Tab = 'all' | 'new' | 'follow_up' | 'converted';

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  service_interest: string | null;
  source: string;
  status: string;
  notes: string | null;
  created_at: string;
  tags?: { name: string; color: string }[];
};

/* Mirrors STATUS_CONFIG in LeadsPage. */
const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'warn' | 'danger' }> = {
  new: { label: 'New', tone: 'info' },
  follow_up: { label: 'Follow Up', tone: 'warn' },
  quoted: { label: 'Quoted', tone: 'info' },
  commercial: { label: 'Commercial', tone: 'warn' },
  converted: { label: 'Converted', tone: 'success' },
  lost: { label: 'Lost', tone: 'danger' },
};
const statusBadge = (s: string) => STATUS[s] ?? { label: s, tone: 'info' as const };

/* Mirrors SOURCE_OPTIONS. The live table skips this and prints the raw slug. */
const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  referral: 'Referral',
  google: 'Google',
  facebook: 'Facebook',
  other: 'Other',
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

const LEADS: Lead[] = [
  {
    id: '1',
    name: 'Teresa Alvarez',
    email: 'teresa.alvarez@gmail.com',
    phone: '(305) 555-0155',
    service_interest: 'Deep Clean',
    source: 'website',
    status: 'new',
    notes: 'Three-bed, two-bath. Asked about weekend availability.',
    created_at: '2026-08-18',
    tags: [{ name: 'Hot', color: 'red' }],
  },
  {
    id: '2',
    name: 'Devon Cross',
    email: 'devon@crossmgmt.co',
    phone: '(954) 555-0122',
    service_interest: 'Office Clean',
    source: 'referral',
    status: 'commercial',
    notes: 'Manages four units downtown. Wants one quote for all of them.',
    created_at: '2026-08-15',
    tags: [{ name: 'Multi-site', color: 'indigo' }, { name: 'Hot', color: 'red' }],
  },
  {
    id: '3',
    name: 'Marisol Reyes',
    email: 'marisol.reyes@outlook.com',
    phone: null,
    service_interest: 'Move-Out Clean',
    source: 'facebook',
    status: 'quoted',
    notes: null,
    created_at: '2026-08-11',
  },
  {
    id: '4',
    name: 'Owen Pryce',
    email: null,
    phone: '(786) 555-0198',
    /* Desktop renders '-' when service_interest is null. */
    service_interest: null,
    source: 'google',
    status: 'follow_up',
    notes: 'Left a voicemail twice. Try mornings.',
    created_at: '2026-08-04',
  },
  {
    id: '5',
    name: 'Hannah Whitfield',
    email: 'hwhitfield@gmail.com',
    phone: '(305) 555-0143',
    service_interest: 'Standard Clean',
    source: 'website',
    status: 'converted',
    notes: 'Booked #2044.',
    created_at: '2026-07-29',
  },
  {
    id: '6',
    name: 'Gregory Sim',
    email: 'greg.sim@yahoo.com',
    phone: '(754) 555-0107',
    service_interest: 'Deep Clean',
    source: 'other',
    status: 'lost',
    notes: 'Went with a cheaper quote.',
    created_at: '2026-07-12',
  },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'all', label: 'All', count: LEADS.length },
  { id: 'new', label: 'New', count: LEADS.filter(l => l.status === 'new').length },
  { id: 'follow_up', label: 'Follow Up', count: LEADS.filter(l => l.status === 'follow_up').length },
  { id: 'converted', label: 'Converted', count: LEADS.filter(l => l.status === 'converted').length },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Six leads across every STATUS_CONFIG member. Sources read "Website"/"Facebook", not the raw slugs the live table prints.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows rather than an empty list.' },
  { id: 'empty', label: 'Empty', why: 'Distinguishes no leads at all from a filter that matched nothing.' },
  { id: 'error', label: 'Error', why: 'The state LeadsPage does not have — today a failed read renders "No leads found".' },
];

export default function LeadsPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return LEADS.filter(l => {
      const matchesSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').includes(q) ||
        sourceLabel(l.source).toLowerCase().includes(q);
      const matchesTab = tab === 'all' || l.status === tab;
      return matchesSearch && matchesTab;
    });
  }, [search, tab]);

  const filtered = search.trim().length > 0 || tab !== 'all';
  const effective: ListState = state === 'ready' && rows.length === 0 ? 'empty' : state;

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

      {/* .portal-v2 carries the --pv-* custom properties. Without it the
          tokens do not resolve and every colour silently falls back to an
          inherited value — which looked plausible against the dark shell,
          which is why it went unnoticed. */}
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Leads"
          action={{ label: 'Add' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name, email, phone, or source..."
          onFilter={() => undefined}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            filtered
              ? {
                  title: 'No leads match that',
                  hint: 'Try a different name, source, or tab.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
              : {
                  title: 'No leads yet',
                  hint: 'Enquiries from your site, and leads you add by hand, will show here.',
                  action: { label: 'Add lead' },
                }
          }
          errorLabel="Couldn't load leads"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          <ListSectionLabel>{rows.length} leads</ListSectionLabel>
          {rows.map(l => (
            <ListRow
              key={l.id}
              lead={{ kind: 'person', name: l.name }}
              title={l.name}
              /* Interest and Source are short and belong together — the pair
                 answers "what do they want, and where did they come from". */
              meta={`${l.service_interest || '-'} · ${sourceLabel(l.source)}`}
              lines={[
                [l.email, l.phone].filter(Boolean).join(' · ') || 'No contact details',
                l.notes || 'No notes',
                `Added ${longDate(l.created_at)}`,
              ]}
              status={[
                statusBadge(l.status),
                /* Tag names are user-authored free text, so they are shown as
                   written. Their colour does not survive: StatusBadge tones
                   carry meaning here (status), and a decorative colour beside
                   a meaningful one would read as meaning. */
                ...(l.tags ?? []).map(t => ({ tone: 'info' as const, label: t.name })),
              ]}
              onClick={() => undefined}
            />
          ))}
        </ListShell>
      </div>
    </div>
  );
}
