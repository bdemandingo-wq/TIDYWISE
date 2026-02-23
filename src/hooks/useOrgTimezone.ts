import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';

const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Hook to fetch the organization's configured timezone from business_settings.
 * Falls back to America/New_York if not configured.
 */
export function useOrgTimezone(): string {
  const { organization } = useOrganization();

  const { data: timezone } = useQuery({
    queryKey: ['org-timezone', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return DEFAULT_TIMEZONE;
      const { data, error } = await supabase
        .from('business_settings')
        .select('timezone')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error || !data?.timezone) return DEFAULT_TIMEZONE;
      return data.timezone;
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 10, // cache for 10 minutes
  });

  return timezone || DEFAULT_TIMEZONE;
}
