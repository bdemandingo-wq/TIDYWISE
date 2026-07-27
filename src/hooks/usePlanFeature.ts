/**
 * usePlanFeature – React hook for tier-aware feature gating.
 *
 * Pairs with src/lib/features.ts. Resolves the user's current
 * organization's effective plan once per session via the
 * my_effective_plan RPC, then returns an { allowed, upgradeTo } pair for
 * any feature key.
 *
 * "Effective" matters: comped orgs, redeemed access codes and in-progress
 * trials all resolve to full features server-side without touching
 * organizations.plan_type, which is billing-owned and locked down by the
 * block_org_billing_self_update trigger.
 */

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';
import {
  canAccess,
  minimumPlanFor,
  PlanContext,
  PlanType,
  FeatureKey,
} from '@/lib/features';

interface PlanState extends PlanContext {
  loading: boolean;
}

// Session-level cache so every component that asks doesn't refetch.
// Cleared when the user changes (different account) below.
let cachedKey: string | null = null;
let cachedState: PlanState | null = null;

const DEFAULT_STATE: PlanState = {
  planType: 'free',
  grandfathered: false,
  loading: true,
};

export function usePlanState(): PlanState {
  const { user } = useAuth();
  const [state, setState] = useState<PlanState>(() => {
    if (cachedKey === (user?.id ?? null) && cachedState) return cachedState;
    return DEFAULT_STATE;
  });

  useEffect(() => {
    const userId = user?.id ?? null;
    if (cachedKey !== userId) {
      // Account switched — drop the cache.
      cachedKey = userId;
      cachedState = null;
    }
    if (!userId) {
      const next: PlanState = { planType: 'free', grandfathered: false, loading: false };
      cachedState = next;
      setState(next);
      return;
    }
    if (cachedState && !cachedState.loading) {
      setState(cachedState);
      return;
    }

    let cancelled = false;
    (async () => {
      // my_effective_plan resolves the caller's own org and folds in the
      // things plan_type alone doesn't know about: an active comped grant,
      // a redeemed access code, or an in-progress Stripe trial. See
      // public.effective_plan.
      const fetchPlan = async () => {
        const { data, error } = await supabase.rpc('my_effective_plan' as never);
        if (error) throw error;
        const rows = data as unknown;
        return (Array.isArray(rows) ? rows[0] : rows) as
          | { plan_type?: string; grandfathered?: boolean }
          | null
          | undefined;
      };

      try {
        let row;
        try {
          row = await fetchPlan();
        } catch {
          row = await fetchPlan(); // one retry — this runs on every app load
        }
        if (cancelled) return;

        const next: PlanState = {
          planType: (row?.plan_type as PlanType) ?? 'free',
          grandfathered: !!row?.grandfathered,
          loading: false,
        };
        cachedKey = userId;
        cachedState = next;
        setState(next);
      } catch {
        // Neither fail open nor fail closed. This used to set
        // grandfathered:true, turning any transient lookup error into a
        // full feature bypass. Failing closed instead would show a paying
        // Custom customer an upgrade wall over a network blip. So we stay
        // in `loading`, which PlanFeatureGate renders as a skeleton — no
        // false unlock, no false wall. Clearing the cache means the next
        // gate to mount retries.
        if (!cancelled) {
          cachedState = null;
          setState({ planType: 'free', grandfathered: false, loading: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return state;
}

export interface FeatureAccess {
  /** Final yes/no for the question "can this user use this feature?" */
  allowed: boolean;
  /** Still resolving the user's plan. UI should render a skeleton, not a block. */
  loading: boolean;
  /** The user's current plan label (raw enum value). */
  planType: PlanType;
  /** Grandfathered orgs always allowed regardless of plan_type. */
  grandfathered: boolean;
  /**
   * The minimum plan the user must upgrade TO to unlock this feature.
   * null when already allowed.
   */
  upgradeTo: 'basic' | 'pro' | 'custom' | null;
}

export function usePlanFeature(featureKey: FeatureKey): FeatureAccess {
  const state = usePlanState();
  const allowed = !state.loading && canAccess(featureKey, state);
  return {
    allowed,
    loading: state.loading,
    planType: state.planType,
    grandfathered: state.grandfathered,
    upgradeTo: allowed ? null : minimumPlanFor(featureKey),
  };
}
