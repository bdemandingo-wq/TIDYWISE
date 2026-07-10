import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';

/**
 * Per-organization overrides mapping nav item id → NAV_ICON_LIBRARY key.
 * Persisted in `organization_mobile_nav_settings.icon_overrides` so the
 * choice syncs across browsers, devices, and the Capacitor iOS/Android
 * apps.
 */
export type NavIconOverrides = Record<string, string>;

const EMPTY: NavIconOverrides = {};

export function useNavIconOverrides() {
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['nav-icon-overrides', organizationId],
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<NavIconOverrides> => {
      if (!organizationId) return EMPTY;
      const { data, error } = await supabase
        .from('organization_mobile_nav_settings')
        .select('icon_overrides')
        .eq('organization_id', organizationId)
        .eq('role', 'admin')
        .maybeSingle();
      if (error) return EMPTY;
      const raw = (data as any)?.icon_overrides;
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as NavIconOverrides : EMPTY;
    },
  });

  // Live-sync across tabs / devices via Supabase realtime.
  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel(`nav-icons-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organization_mobile_nav_settings',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['nav-icon-overrides', organizationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient]);

  const save = useCallback(
    async (next: NavIconOverrides) => {
      if (!organizationId) return;
      const { error } = await supabase
        .from('organization_mobile_nav_settings')
        .upsert(
          {
            organization_id: organizationId,
            role: 'admin',
            icon_overrides: next,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'organization_id,role' },
        );
      if (error) throw error;
      queryClient.setQueryData(['nav-icon-overrides', organizationId], next);
    },
    [organizationId, queryClient],
  );

  const setIcon = useCallback(
    async (navId: string, iconKey: string | null) => {
      const current = query.data ?? EMPTY;
      const next: NavIconOverrides = { ...current };
      if (iconKey) next[navId] = iconKey;
      else delete next[navId];
      await save(next);
    },
    [query.data, save],
  );

  const resetAll = useCallback(async () => {
    await save({});
  }, [save]);

  return {
    overrides: query.data ?? EMPTY,
    isLoading: query.isLoading,
    setIcon,
    resetAll,
    save,
  };
}
