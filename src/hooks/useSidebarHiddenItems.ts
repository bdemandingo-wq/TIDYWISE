import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';

/**
 * Sidebar visibility preferences.
 *
 * SOURCE OF TRUTH: `user_preferences` row keyed by (user_id, organization_id,
 * preference_key='sidebar_hidden'). The database wins — never trust the
 * legacy global `tidywise_nav_hidden` localStorage key.
 *
 * Local cache: we mirror the DB result into a per-user/per-org localStorage
 * key so the sidebar can hydrate instantly on repeat visits without flashing
 * hidden tabs. Cache keys are scoped so switching orgs never reads a stale
 * copy, and we purge every scoped key on sign-out / org-switch below.
 */

const CACHE_PREFIX = 'tidywise_nav_hidden_v2';
const LEGACY_KEY = 'tidywise_nav_hidden';

function cacheKeyFor(userId: string, orgId: string) {
  return `${CACHE_PREFIX}:${userId}:${orgId}`;
}

function readCache(userId: string | null | undefined, orgId: string | null | undefined): string[] | null {
  if (!userId || !orgId) return null;
  try {
    const raw = localStorage.getItem(cacheKeyFor(userId, orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, orgId: string, hidden: string[]) {
  try {
    localStorage.setItem(cacheKeyFor(userId, orgId), JSON.stringify(hidden));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Purge every scoped sidebar-visibility cache and the deprecated global key.
 * Call on sign-out, org switch, and invite acceptance so a different user or
 * org never inherits stale visibility.
 */
export function clearSidebarHiddenItemsCache() {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${CACHE_PREFIX}:`)) toRemove.push(key);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function useSidebarHiddenItems() {
  const { user } = useAuth();
  const { organizationId } = useOrgId();
  const queryClient = useQueryClient();

  // Remove the legacy global key exactly once — it was written by prior
  // versions of the sidebar and would otherwise leak across users on a
  // shared device.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey array is recreated each render; the useCallback at line 157 uses it but queryClient.invalidateQueries compares by value not ref
  const queryKey = ['sidebar-hidden', user?.id ?? null, organizationId ?? null] as const;

  const query = useQuery({
    queryKey,
    enabled: !!user?.id && !!organizationId,
    // Seed react-query with the scoped cache so the sidebar renders
    // instantly with the last-known visibility instead of flashing every
    // item.
    initialData: () => readCache(user?.id, organizationId) ?? undefined,
    queryFn: async (): Promise<string[]> => {
      if (!user?.id || !organizationId) return [];
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preference_value')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', 'sidebar_hidden')
        .maybeSingle();

      if (error) throw error;
      const value = (data?.preference_value as string[] | null) ?? [];
      const hidden = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
      writeCache(user.id, organizationId, hidden);
      return hidden;
    },
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async (hidden: string[]) => {
      if (!user?.id || !organizationId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            organization_id: organizationId,
            preference_key: 'sidebar_hidden',
            preference_value: hidden,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,organization_id,preference_key' },
        );
      if (error) throw error;
      writeCache(user.id, organizationId, hidden);
      return hidden;
    },
    onSuccess: (hidden) => {
      queryClient.setQueryData(queryKey, hidden);
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      if (!user?.id || !organizationId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .eq('preference_key', 'sidebar_hidden');
      if (error) throw error;
      try {
        localStorage.removeItem(cacheKeyFor(user.id, organizationId));
      } catch {
        /* ignore */
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(queryKey, []);
    },
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Until we know the user + org AND the query resolves at least once,
  // treat visibility as "loading" so the sidebar can suppress the nav list
  // instead of briefly rendering tabs the user hid.
  const isLoading =
    !user?.id || !organizationId || (query.isPending && query.data === undefined);

  return {
    hiddenItems: query.data ?? [],
    isLoading,
    isSaving: save.isPending,
    isResetting: reset.isPending,
    save: save.mutateAsync,
    reset: reset.mutateAsync,
    refresh,
  };
}
