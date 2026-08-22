import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { combinedPhase, queryPhase } from '@/lib/queryState';
import { customerDisplayName } from '@/lib/customerStatus';
import { SimpleListView, useSimpleSearch, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/messages-v2 — SMS conversations on real data. ADDITIVE.
 *
 * ── This org has never sent an SMS ────────────────────────────────────────
 *
 * sms_conversations: 0 rows. sms_messages: 0 rows. So the ready state cannot
 * be verified against live data here — only empty, loading and error can. That
 * is stated plainly rather than implied, and it is why the states preview at
 * /dashboard/preview/messages-states matters more on this screen than on any
 * other: it is the only way to see the ready state at all.
 *
 * ── A failed read degrades every name to a phone number, silently ─────────
 *
 * MessagesPage loads four things in one Promise.all (:447) — conversations,
 * customers, staff and leads — and checks the error on exactly ONE of them.
 * `convsRes.error` gets a toast; customersRes, staffRes and leadsRes are never
 * checked, and their data is read as `(customersRes.data || [])`.
 *
 * So if the customers read fails, the phone-to-name map is empty and every
 * conversation falls back to a raw phone number, with no error and nothing to
 * distinguish it from a list of genuinely unknown numbers. The operator sees
 * anonymous phone numbers and has no way to know why.
 *
 * Here the name lookup is its own query with its own phase. When it fails the
 * conversations still render — they are still usable — but the screen says the
 * names are missing rather than pretending the numbers are all it has.
 *
 * ── Names come from the column first, then the phone match ────────────────
 *
 * sms_conversations.customer_name already exists and is editable (:638). The
 * phone match is a fallback that fills it in, and the live precedence —
 * staff > customer > lead, via if/else-if (:475) — is correct: a cleaner's
 * number should read as a cleaner. Kept as-is.
 *
 * Names go through customerDisplayName because `${first} ${last}` on this data
 * produces doubled spaces ("apple  client"), which MessagesPage:461 reproduces.
 * Third place that defect surfaces, after the customers list and leads.name.
 */

export function MessagesMobileBody() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const convsQ = useQuery({
    queryKey: ['messages-v2-convs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('sms_conversations')
        .select('id, customer_phone, customer_name, conversation_type, unread_count, last_message_at')
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false })
        /* last_message_at is not unique — two replies in the same second are
           ordinary — so the sort needs a tiebreaker to be total. */
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });

  /* The name lookup, as its own query so its failure is visible rather than
     silently emptying every name. */
  const namesQ = useQuery({
    queryKey: ['messages-v2-names', organizationId],
    queryFn: async () => {
      if (!organizationId) return { customers: [], staff: [], leads: [] };
      const [c, s, l] = await Promise.all([
        supabase.from('customers').select('phone, first_name, last_name').eq('organization_id', organizationId).not('phone', 'is', null),
        supabase.from('staff').select('phone, name').eq('organization_id', organizationId).not('phone', 'is', null),
        supabase.from('leads').select('phone, name').eq('organization_id', organizationId).not('phone', 'is', null),
      ]);
      /* All three checked. The live screen checks none of them. */
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      if (l.error) throw l.error;
      return { customers: c.data ?? [], staff: s.data ?? [], leads: l.data ?? [] };
    },
    enabled: !!organizationId,
  });

  const normalize = (p: string) => p.replace(/\D/g, '').slice(-10);

  const lookup = useMemo(() => {
    const staff = new Map<string, string>();
    const customers = new Map<string, string>();
    const leads = new Map<string, string>();
    const d = namesQ.data;
    if (!d) return { staff, customers, leads };
    for (const s of d.staff as any[]) if (s.phone && s.name) staff.set(normalize(s.phone), s.name);
    for (const c of d.customers as any[]) {
      const n = customerDisplayName(c.first_name, c.last_name);
      if (c.phone && n) customers.set(normalize(c.phone), n);
    }
    for (const l of d.leads as any[]) {
      const n = customerDisplayName(l.name, null);
      if (l.phone && n) leads.set(normalize(l.phone), n);
    }
    return { staff, customers, leads };
  }, [namesQ.data]);

  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const namesOk = queryPhase(namesQ) === 'ready';

  const rows: SimpleListRow[] = useMemo(
    () =>
      (convsQ.data ?? []).map((c: any) => {
        const norm = normalize(c.customer_phone);
        /* Column first, then the match — staff > customer > lead, the live
           precedence. */
        const matched = namesOk
          ? lookup.staff.get(norm) ?? lookup.customers.get(norm) ?? lookup.leads.get(norm)
          : undefined;
        const who = matched ?? (c.customer_name ? customerDisplayName(c.customer_name, null) : null);
        const kind = lookup.staff.has(norm) ? 'Cleaner' : c.conversation_type === 'cleaner' ? 'Cleaner' : 'Client';
        const unread = c.unread_count ?? 0;
        return {
          id: c.id,
          title: who ?? c.customer_phone,
          meta: who ? c.customer_phone : namesOk ? 'Not in your contacts' : 'Name unavailable',
          lines: [c.last_message_at ? fmt(c.last_message_at) : null, kind],
          badges: unread > 0 ? [{ tone: 'warn' as const, label: `${unread} unread` }] : undefined,
        };
      }),
    [convsQ.data, lookup, namesOk, fmt],
  );

  const filtered = useSimpleSearch(rows, search);
  const phase = combinedPhase([convsQ]);

  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : filtered.length === 0
          ? 'empty'
          : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <SimpleListView
          title="Messages"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or number..."
          emptyTitle="No conversations yet"
          emptyHint="Texts to and from customers and cleaners will show here."
          errorLabel="Couldn't load conversations"
          addLabel="New message"
          onRetry={() => {
            convsQ.refetch();
            namesQ.refetch();
          }}
          /* Conversations loaded, names did not — the case the live screen
             cannot express. */
          note={
            phase === 'ready' && !namesOk && rows.length > 0
              ? "Couldn't match numbers to your contacts, so some conversations show a phone number instead of a name. The conversations themselves are complete."
              : undefined
          }
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : `${rows.length} conversation${rows.length === 1 ? '' : 's'}`
          }
        />
      </div>
    </>
  );
}

/* ── Layout-free bodies ───────────────────────────────────────────────────
   Each screen is exported twice.

   *MobileBody renders the screen and NOTHING around it — no AdminLayout, no
   page chrome. That is what an existing admin page drops into its mobile
   branch, without nesting AdminLayout inside AdminLayout and getting two
   headers and two sidebars.

   The default/named *WiredPage export keeps the layout and is what the
   /dashboard/*-v2 route renders, so those routes are unchanged.
   ──────────────────────────────────────────────────────────────────────── */


export default function MessagesWiredPage() {
  return (
    <AdminLayout title="Messages" subtitle="Mobile layout, live data">
      <MessagesMobileBody />
    </AdminLayout>
  );
}
