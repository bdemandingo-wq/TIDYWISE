import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { readEdgeFunctionError } from '@/lib/edgeFunctionError';

export type MessageClass = 'transactional' | 'marketing';

export interface BroadcastRow {
  id: string;
  subject: string;
  message_class: MessageClass;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  completed_at: string | null;
}

// Plain arrays and objects only — never a Map or Set. The query cache is
// persisted to localStorage via JSON.stringify, which flattens both to {}
// and throws on the next .get() (CLAUDE.md rule 1).
export function useBroadcasts() {
  return useQuery({
    queryKey: ['broadcasts'],
    queryFn: async (): Promise<BroadcastRow[]> => {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('id, subject, message_class, status, recipient_count, sent_count, failed_count, skipped_count, created_at, completed_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });   // rule 3: unique tiebreaker
      if (error) throw error;
      // The generated Supabase types widen the `message_class` CHECK
      // constraint to `string` (it's not a Postgres enum), so the raw select
      // result does not structurally satisfy BroadcastRow. Narrowed here,
      // once, the same way useBillingRevenue.ts narrows its own view columns.
      return (data ?? []).map((r) => ({ ...r, message_class: r.message_class as MessageClass }));
    },
  });
}

// `if (error) throw error` would discard everything the function said.
// supabase-js collapses every non-2xx response into a FunctionsHttpError whose
// message is the generic "Edge Function returned a non-2xx status code", and
// sets `data` to null — so a `data?.error` branch after it is unreachable dead
// code. That exact shape once made PublicBookingPage's double-booking branch
// impossible to fire; `src/lib/edgeFunctionError.ts` exists because of it.
//
// It matters more here than in most places. The messages being thrown away
// include "audience resolved to 0 recipients — refusing to create an empty
// broadcast" and "broadcast is sending, not draft" — precisely what an
// operator needs to read in a tool with no unsend.
async function callAdmin(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('broadcast-admin', { body: payload });
  if (error) {
    throw new Error(
      await readEdgeFunctionError(error, `Broadcast ${payload.action ?? 'request'} failed`),
    );
  }
  return data;
}

export function useCreateBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      subject: string;
      body_text: string;
      message_class: MessageClass;
      signature_text: string;
    }) => callAdmin({ action: 'create', ...v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useTestSend() {
  return useMutation({
    mutationFn: (broadcast_id: string) => callAdmin({ action: 'test_send', broadcast_id }),
  });
}

export function useStartBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (broadcast_id: string) => callAdmin({ action: 'start', broadcast_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export function useRetryFailed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (broadcast_id: string) => callAdmin({ action: 'retry_failed', broadcast_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  });
}

export interface RecipientRow {
  id: string;
  email: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
  skip_reason: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  // Needed by item 6's stuck-in-'sending' detection: a row is stale when its
  // status is 'sending' and updated_at is older than 10 minutes. sent_at is
  // null on those rows by definition, so it cannot serve as the clock.
  updated_at: string;
}

export function useBroadcastRecipients(broadcastId: string | undefined) {
  return useQuery({
    queryKey: ['broadcast-recipients', broadcastId],
    enabled: !!broadcastId,
    // Poll while the send is in flight; 96 recipients finish in well under a
    // minute, so a 5s tick is enough to watch it complete.
    refetchInterval: (q) => {
      const rows = (q.state.data ?? []) as RecipientRow[];
      return rows.some((r) => r.status === 'queued' || r.status === 'sending') ? 5000 : false;
    },
    queryFn: async (): Promise<RecipientRow[]> => {
      const { data, error } = await supabase
        .from('broadcast_recipients')
        .select('id, email, status, skip_reason, error_message, attempts, sent_at, updated_at')
        .eq('broadcast_id', broadcastId!)
        .order('status', { ascending: true })
        .order('id', { ascending: true });   // rule 3
      if (error) throw error;
      // Same widening as BroadcastRow.message_class above: broadcast_recipients.status
      // is a CHECK constraint, not a Postgres enum, so the generated type is `string`.
      return (data ?? []).map((r) => ({ ...r, status: r.status as RecipientRow['status'] }));
    },
  });
}

/**
 * Whether a test send has already gone out for `broadcastId`, read from the
 * broadcast row rather than from component state.
 *
 * The send gate used to live in a `testedDraftId` useState on BroadcastPage.
 * That worked while the composer owned a whole route, but the composer now
 * renders inside a Radix tab, and Radix unmounts inactive TabsContent — so
 * switching to Revenue and back silently reset the flag and re-locked Send on
 * a draft that HAD been tested. Worse, the reverse is the dangerous one: any
 * scheme that restored the flag optimistically would light up Send for a draft
 * whose test never actually left. The row is the only thing that survives an
 * unmount, a refresh, and a different browser.
 *
 * Fails CLOSED. A query error resolves to `false`, not `undefined`, so the
 * caller treats "we could not tell" the same as "not tested" and Send stays
 * locked. That also makes this safe to ship before the column exists: until
 * broadcast-admin writes `last_test_sent_at`, this returns false and the
 * operator is asked to send a test — which is the current behaviour anyway.
 * The alternative failure direction would arm an irreversible send to every
 * owner on a query hiccup.
 *
 * Scoped by broadcastId for the same reason the old flag compared ids: Start
 * over mints a new draft, and a stale answer for the previous draft must never
 * satisfy the gate for the new one.
 */
export function useBroadcastTested(broadcastId: string | null | undefined) {
  return useQuery({
    queryKey: ['broadcast-tested', broadcastId],
    enabled: !!broadcastId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('last_test_sent_at')
        .eq('id', broadcastId!)
        .maybeSingle();
      // Swallowed deliberately, against CLAUDE.md rule 5's usual "errors and
      // not-found are different answers". Here they are not: both mean "no
      // proof a test was sent", and the only safe rendering of that is a
      // locked Send button. A 42703 (column absent, pre-migration) lands here
      // too and degrades to the same locked state.
      if (error) return false;
      return !!(data as { last_test_sent_at: string | null } | null)?.last_test_sent_at;
    },
  });
}
