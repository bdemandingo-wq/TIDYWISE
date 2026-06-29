import { supabase } from '@/lib/supabase';
import type { ZapierEvent } from '@/lib/zapier';

export type GhlEvent = ZapierEvent;

/**
 * Fire-and-forget GoHighLevel dispatch. Never throws — the edge function
 * silently skips if GHL isn't configured / enabled for this organization.
 */
export async function dispatchGhl(
  event: GhlEvent,
  organizationId: string | undefined | null,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!organizationId) return;
  try {
    await supabase.functions.invoke('ghl-dispatch', {
      body: {
        organization_id: organizationId,
        event_type: event,
        payload,
        mode: 'dispatch',
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[ghl] dispatch failed', event, e);
  }
}
