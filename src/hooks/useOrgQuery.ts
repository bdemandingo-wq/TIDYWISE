import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/hooks/useAuth';
import { deriveOrgQueryState, type OrgQueryState } from '@/hooks/orgQueryState';

/**
 * useQuery for organization-scoped data, with the two things every call site
 * was getting wrong made automatic.
 *
 * 1. THE SESSION IS A DEPENDENCY, NOT AN ASSUMPTION.
 *    organization?.id resolves before the Supabase client attaches its token.
 *    Every RLS-gated read and every SECURITY DEFINER function that reads
 *    auth.uid() returns ZERO ROWS to an untokened caller — not an error, zero
 *    rows. The query key here includes the session user id, so the request
 *    re-fires the moment the session lands, and `enabled` requires a token, so
 *    it is never sent as anon to come back mysteriously empty.
 *
 * 2. A FAILURE IS NOT AN EMPTY LIST.
 *    The old shape was `const { data: rows = [] } = useQuery(...)` followed by
 *    `rows.length === 0 && <p>Nothing here</p>`, which states as fact that
 *    there is no data whenever anything at all goes wrong. Use `isEmpty` from
 *    this hook instead: it is true only when a request completed, succeeded,
 *    and returned nothing. See orgQueryState.ts.
 *
 * The organization id is passed INTO queryFn rather than captured, so it cannot
 * be stale relative to the key.
 *
 * ── shape at the call site ─────────────────────────────────────────────────
 *
 *   const { rows, error, isEmpty, isLoading } = useOrgQuery({
 *     key: ['org-members'],
 *     query: async (organizationId) => {
 *       const { data, error } = await supabase
 *         .from('members').select('*').eq('organization_id', organizationId);
 *       if (error) throw error;
 *       return data ?? [];
 *     },
 *   });
 *
 *   {isLoading && <Spinner />}
 *   {error    && <p className="text-destructive">Couldn’t load. {error.message}</p>}
 *   {isEmpty  && <p>No members yet.</p>}
 *   {rows.map(...)}
 *
 * `rows` is always an array, so mapping is safe in every state — but it is
 * empty while loading and while failed, which is exactly why the empty MESSAGE
 * must be driven by isEmpty rather than by rows.length.
 */
export function useOrgQuery<T>(opts: {
  /** Key WITHOUT the organization id or session — both are appended here, so
   *  they cannot be forgotten and cannot drift between call sites. */
  key: QueryKey;
  query: (organizationId: string) => Promise<T[]>;
  /** ANDed with the session and organization gates; never replaces them. */
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
}): OrgQueryState<T> & { refetch: () => void } {
  const { organization } = useOrganization();
  const { session } = useAuth();

  const organizationId = organization?.id;
  const accessToken = session?.access_token;
  // Keyed on the user id, not the token: the token rotates on refresh and would
  // refetch everything each time, while the id transitions undefined -> defined
  // exactly once, which is the transition that needs to invalidate.
  const sessionUserId = session?.user?.id;

  const enabled = !!organizationId && !!accessToken && (opts.enabled ?? true);

  const q = useQuery({
    queryKey: [...(opts.key as unknown[]), organizationId, sessionUserId],
    enabled,
    staleTime: opts.staleTime,
    refetchInterval: opts.refetchInterval,
    queryFn: () => opts.query(organizationId!),
  });

  return {
    ...deriveOrgQueryState<T>({
      enabled,
      isLoading: q.isLoading,
      error: q.error,
      data: q.data,
    }),
    refetch: () => { void q.refetch(); },
  };
}
