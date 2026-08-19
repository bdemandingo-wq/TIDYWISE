import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/hooks/useAuth';
import { deriveOrgRecordState, type OrgRecordState } from '@/hooks/orgRecordState';

/**
 * useQuery for a single organization-scoped row — the counterpart to
 * useOrgQuery, with the same session gating and the same refusal to let a
 * failure impersonate an ordinary result.
 *
 * Use this for settings rows, config records, and anything else read with
 * .maybeSingle(). Use useOrgQuery for lists.
 *
 * The difference that matters is what "nothing came back" means. For a list it
 * is an empty state to render; for a single row it is usually "fall back to a
 * default". Getting that wrong is more expensive here, because the fallback is
 * silent by design — nobody sees a default being applied.
 *
 * ── shape at the call site ─────────────────────────────────────────────────
 *
 *   const { row, isMissing, error } = useOrgRecord({
 *     key: ['payroll-settings'],
 *     query: async (organizationId) => {
 *       const { data, error } = await supabase
 *         .from('org_settings').select('*')
 *         .eq('organization_id', organizationId).maybeSingle();
 *       if (error) throw error;          // throw — do NOT return null
 *       return data;
 *     },
 *   });
 *
 *   const settings = isMissing ? DEFAULTS : row;   // only on a genuine miss
 *   {error && <p>Couldn’t load settings. {error.message}</p>}
 *
 * Note the `if (error) throw error` in the queryFn. Returning null there is the
 * exact bug this hook exists to prevent: it collapses "failed to read" into
 * "not configured", and the caller then applies a default it has no business
 * applying.
 */
export function useOrgRecord<T>(opts: {
  /** Key WITHOUT the organization id or session — both are appended here. */
  key: QueryKey;
  /** Return the row, or null when there genuinely is none. THROW on error. */
  query: (organizationId: string) => Promise<T | null>;
  enabled?: boolean;
  staleTime?: number;
}): OrgRecordState<T> & { refetch: () => void } {
  const { organization } = useOrganization();
  const { session } = useAuth();

  const organizationId = organization?.id;
  const accessToken = session?.access_token;
  const sessionUserId = session?.user?.id;

  const enabled = !!organizationId && !!accessToken && (opts.enabled ?? true);

  const q = useQuery({
    queryKey: [...(opts.key as unknown[]), organizationId, sessionUserId],
    enabled,
    staleTime: opts.staleTime,
    queryFn: () => opts.query(organizationId!),
  });

  return {
    ...deriveOrgRecordState<T>({
      enabled,
      isLoading: q.isLoading,
      error: q.error,
      data: q.data,
    }),
    refetch: () => { void q.refetch(); },
  };
}
