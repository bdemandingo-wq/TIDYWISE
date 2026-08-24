/**
 * Guards against the silent-write class of bug.
 *
 * PostgREST returns HTTP 204 with `error: null` when an UPDATE or DELETE matches
 * zero rows — and RLS filtering a row out is indistinguishable, from the client,
 * from the row simply not existing. So this:
 *
 *     const { error } = await supabase.from('leads').update(data).eq('id', id);
 *     if (error) throw error;               // never fires
 *     toast.success('Saved');               // lies
 *
 * reports success for a write that saved nothing. That took production down on
 * 2026-08-24: a user with two org memberships edited leads for an hour, every
 * edit toasted "Lead updated", and none of them were written.
 *
 * `.select()` changes the response to the affected rows, so an empty array is a
 * reliable "nothing was written" signal. These helpers make that the default.
 *
 * Usage — pass the builder *before* calling `.select()`; the helper adds it:
 *
 *     await mustAffectRows(
 *       supabase.from('leads').update(data).eq('id', id),
 *       'Lead not saved — you may not have access to it in this business.',
 *     );
 *
 * When zero rows is a legitimate outcome (an optional child row that may not
 * exist), use `affectedRows()` and branch on the count instead of throwing.
 * When the write is deliberately fire-and-forget (analytics, link tracking),
 * leave it alone and say so in a comment — see the note at the bottom.
 */

/** Thrown when a write succeeded at the protocol level but changed nothing. */
export class SilentWriteError extends Error {
  readonly table?: string;

  constructor(message: string, table?: string) {
    super(message);
    this.name = 'SilentWriteError';
    this.table = table;
  }
}

// Supabase's builder generics don't survive a generic wrapper, and narrowing
// them here would force every call site to spell out row types it doesn't
// otherwise need. The runtime contract (thenable → { data, error }) is what
// matters, so the surface is intentionally loose.
type WriteBuilder = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (columns?: string) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
};

/**
 * Runs the write and returns how many rows it actually changed.
 * Throws on a real PostgREST error; returns 0 rather than throwing when the
 * write was filtered out. Use when zero is an acceptable outcome.
 */
export async function affectedRows(builder: WriteBuilder, columns = 'id'): Promise<number> {
  const { data, error } = await builder.select(columns);
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Runs the write and throws unless at least one row changed.
 * Returns the number of rows affected so callers can assert on it further
 * (e.g. a bulk update that expected exactly N).
 */
export async function mustAffectRows(
  builder: WriteBuilder,
  message: string,
  options?: { table?: string; columns?: string },
): Promise<number> {
  const count = await affectedRows(builder, options?.columns ?? 'id');
  if (count === 0) throw new SilentWriteError(message, options?.table);
  return count;
}

/**
 * Marks a write as deliberately fire-and-forget: failure is acceptable and must
 * not surface to the user or block the calling flow. Use this instead of a bare
 * floating promise so the intent is explicit and nobody "fixes" it later by
 * adding a guard that turns analytics noise into a user-visible error.
 *
 * Reserved for writes with no user-visible consequence — link tracking, funnel
 * step counters, read receipts. Never for anything that touches money, status,
 * assignment, or scheduling.
 */
export function fireAndForget(builder: PromiseLike<unknown>, reason: string): void {
  void Promise.resolve(builder).then(
    () => {},
    (err) => {
      // Debug-level only: by definition the user does not need to know.
      console.debug(`[fire-and-forget] ${reason}`, err);
    },
  );
}
