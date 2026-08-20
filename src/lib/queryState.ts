import type { UseQueryResult } from '@tanstack/react-query';

/**
 * One definition of "what is this query doing", including the state that is
 * easy to miss.
 *
 * React Query has FOUR outcomes, not three. Beyond ready / loading / error it
 * can PAUSE a query it believes cannot reach the network. A paused query has:
 *
 *     status: 'pending'      isPending: true
 *     fetchStatus: 'paused'  isFetching: false
 *     data: undefined        error: null
 *
 * and `isLoading` is defined in v5 as `isPending && isFetching`, so a paused
 * query reports **isLoading false with no error and no data**. Every guard of
 * the shape
 *
 *     error ? 'error' : isLoading ? 'loading' : !data?.length ? 'empty' : ...
 *
 * therefore falls through to the empty branch while offline. Observed live on
 * the admin customers screen: forcing the read to fail rendered "No customers
 * yet" with an invitation to add one, and the probe read
 * `{hasErr: false, isLoading: false, n: 0}`.
 *
 * That matters here more than in most apps. This one is wrapped in
 * PersistQueryClientProvider precisely so it works offline, which makes
 * "offline with nothing cached for this key" a designed-for condition rather
 * than a freak one.
 *
 * `offline` is only reported when there is nothing to show. With cached rows
 * the pause is invisible and the data renders, which is the intended offline
 * behaviour — the cache doing its job is not a state worth interrupting for.
 */
export type QueryPhase = 'error' | 'offline' | 'loading' | 'ready';

type AnyQuery = Pick<
  UseQueryResult<unknown, unknown>,
  'error' | 'isPending' | 'fetchStatus'
> & { data?: unknown };

const isEmpty = (d: unknown) =>
  d === undefined || d === null || (Array.isArray(d) && d.length === 0);

/**
 * Classify one query. Order matters: a real error outranks a pause, because
 * an error is a fact about the request while a pause is a fact about the
 * device.
 */
export function queryPhase(q: AnyQuery): QueryPhase {
  if (q.error) return 'error';
  if (q.fetchStatus === 'paused' && isEmpty(q.data)) return 'offline';
  if (q.isPending) return 'loading';
  return 'ready';
}

/**
 * Classify several queries as one screen state — the common case, since most
 * screens read a handful of things before they can render.
 *
 * Worst-first: any error makes the screen an error; otherwise any offline
 * makes it offline; otherwise any still-pending makes it loading. A screen
 * that is partly broken must not present as merely slow.
 */
export function combinedPhase(queries: AnyQuery[]): QueryPhase {
  const phases = queries.map(queryPhase);
  if (phases.includes('error')) return 'error';
  if (phases.includes('offline')) return 'offline';
  if (phases.includes('loading')) return 'loading';
  return 'ready';
}
