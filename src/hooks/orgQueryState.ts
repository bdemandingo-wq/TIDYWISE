/**
 * The pure core of useOrgQuery, split out so the rule it encodes can be tested
 * without a DOM or a React renderer.
 *
 * THE BUG THIS EXISTS TO MAKE UNREPRESENTABLE
 *
 * Across this codebase the shape was:
 *
 *     const { data: rows = [] } = useQuery({ ... });
 *     {rows.length === 0 && <p>No members yet.</p>}
 *
 * Three failures collapse into one rendering there. Still loading, failed to
 * load, and genuinely empty all produce `rows.length === 0`, so a failure is
 * displayed as a confident statement that there is no data. That cost three
 * separate debugging rounds in two days — the team list, the lead initials and
 * the message initials — and in each one the backend was fine the whole time.
 *
 * So `isEmpty` here is NOT `rows.length === 0`. It is true only when a request
 * actually completed and actually returned nothing. Loading is not empty and
 * failed is not empty, because neither of those justifies telling someone their
 * organization has no members.
 */

export type OrgQueryStatus = 'disabled' | 'loading' | 'error' | 'ready';

export interface OrgQueryState<T> {
  status: OrgQueryStatus;
  rows: T[];
  error: Error | null;
  /** Completed, succeeded, returned nothing. The ONLY safe basis for an
   *  "it's empty" message. */
  isEmpty: boolean;
  /** Not yet runnable — no session or no organization. Distinct from loading:
   *  nothing has been asked for, so no spinner is owed either. */
  isDisabled: boolean;
  isLoading: boolean;
}

/**
 * PostgREST and supabase-js both reject with plain objects in places —
 * `{ code: '42501', message: 'permission denied for table x' }` is not an
 * Error. `String(that)` yields "[object Object]", which throws away the only
 * part anyone needed. Preserve the message, or failing that the whole shape.
 */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const o = error as { message?: unknown; code?: unknown };
    const msg = typeof o.message === 'string' ? o.message : JSON.stringify(error);
    return new Error(typeof o.code === 'string' && !msg.includes(o.code) ? `${o.code}: ${msg}` : msg);
  }
  return new Error(String(error));
}

export function deriveOrgQueryState<T>(input: {
  enabled: boolean;
  isLoading: boolean;
  error: unknown;
  data: T[] | undefined;
}): OrgQueryState<T> {
  const { enabled, isLoading, error, data } = input;

  // Order matters. Each branch below claims a condition the later ones must not
  // be allowed to re-interpret as emptiness.
  if (!enabled) {
    return { status: 'disabled', rows: [], error: null, isEmpty: false, isDisabled: true, isLoading: false };
  }
  if (error) {
    return { status: 'error', rows: [], error: toError(error), isEmpty: false, isDisabled: false, isLoading: false };
  }
  if (isLoading || data === undefined) {
    // data === undefined is deliberate alongside isLoading. A refetch can leave
    // isLoading false while data has not arrived, and treating that as ready
    // would flash "no results" between renders.
    return { status: 'loading', rows: [], error: null, isEmpty: false, isDisabled: false, isLoading: true };
  }
  return {
    status: 'ready',
    rows: data,
    error: null,
    isEmpty: data.length === 0,
    isDisabled: false,
    isLoading: false,
  };
}
