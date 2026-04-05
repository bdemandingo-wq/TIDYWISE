import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from './useOrgId';

export interface OrgFeatureFlags {
  openphone_calls_enabled: boolean;
  ai_assistant_enabled: boolean;
  daily_reports_enabled: boolean;
  integration_hub_enabled: boolean;
  demo_requests_enabled: boolean;
}

const DEFAULT_FLAGS: OrgFeatureFlags = {
  openphone_calls_enabled: false,
  ai_assistant_enabled: false,
  daily_reports_enabled: false,
  integration_hub_enabled: true,
  demo_requests_enabled: true,
};

export function useOrgFeatureFlags() {
  const { organizationId } = useOrgId();

  const { data: flags, isLoading } = useQuery({
    queryKey: ['org-feature-flags', organizationId],
    queryFn: async () => {
      if (!organizationId) return DEFAULT_FLAGS;
      const { data, error } = await supabase
        .from('org_feature_flags')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error || !data) return DEFAULT_FLAGS;
      return {
        openphone_calls_enabled: data.openphone_calls_enabled ?? false,
        ai_assistant_enabled: data.ai_assistant_enabled ?? false,
        daily_reports_enabled: data.daily_reports_enabled ?? false,
        integration_hub_enabled: data.integration_hub_enabled ?? true,
        demo_requests_enabled: data.demo_requests_enabled ?? true,
      } as OrgFeatureFlags;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  return { flags: flags ?? DEFAULT_FLAGS, isLoading };
}
