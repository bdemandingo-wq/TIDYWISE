import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrgId } from './useOrgId';

/**
 * Reads the org-level `onboarding_progress.copilot_enabled` flag and keeps it
 * in sync via realtime. Defaults to TRUE (Tidy on) until proven otherwise so
 * a transient fetch error never silently hides the bubble.
 *
 * Returns `null` while loading so callers can choose not to flicker the UI.
 */
export function useCopilotEnabled(): boolean | null {
  const { organizationId } = useOrgId();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setEnabled(null);
      return;
    }

    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from('onboarding_progress')
        .select('copilot_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[copilot] failed to read copilot_enabled, defaulting on', error);
        setEnabled(true);
        return;
      }
      // No row yet → treat as enabled (default).
      setEnabled(data?.copilot_enabled ?? true);
    })();

    const channel = supabase
      .channel(`copilot-enabled:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'onboarding_progress',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const next = (payload.new as any)?.copilot_enabled;
          if (typeof next === 'boolean') setEnabled(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  return enabled;
}
