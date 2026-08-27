import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Sentry } from '@/lib/sentry';

const DEFAULT_TIMEZONE = 'America/New_York';

export interface OrgTimezoneResult {
  timezone: string;
  /** Non-null when the fetch failed. The timezone value is a fallback. */
  error: Error | null;
  /** True when the returned timezone is the default, not the org's configured value. */
  isFallback: boolean;
}

/**
 * Hook to fetch the organization's configured timezone from business_settings.
 * Falls back to America/New_York if not configured (isFallback = false) or if
 * the fetch failed (isFallback = true, error is set).
 *
 * @param orgIdOverride Resolve the timezone for this org instead of the one in
 *   OrganizationContext. Staff surfaces must pass it.
 */
export function useOrgTimezone(orgIdOverride?: string | null): OrgTimezoneResult {
  const { organization } = useOrganization();
  const organizationId = orgIdOverride ?? organization?.id ?? null;

  const { data: timezone, error } = useQuery({
    queryKey: ['org-timezone', organizationId],
    queryFn: async () => {
      if (!organizationId) return DEFAULT_TIMEZONE;
      const { data, error: fetchError } = await supabase
        .from('business_settings')
        .select('timezone')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (fetchError) {
        Sentry.captureException(fetchError, {
          tags: { hook: 'useOrgTimezone', organizationId },
        });
        throw fetchError;
      }
      // Org exists but has no timezone configured — legitimate, not an error.
      if (!data?.timezone) return DEFAULT_TIMEZONE;
      return data.timezone;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 10,
  });

  const resolvedError = error as Error | null;
  return {
    timezone: timezone || DEFAULT_TIMEZONE,
    error: resolvedError,
    isFallback: resolvedError != null || !timezone,
  };
}
