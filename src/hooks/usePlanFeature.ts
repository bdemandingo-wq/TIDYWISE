/**
 * usePlanFeature – React hook for tier-aware feature gating.
 *
 * Pairs with src/lib/features.ts. Resolves the user's current
 * organization's plan_type + grandfathered_lifetime once per session,
 * then returns an { allowed, upgradeTo } pair for any feature key.
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
      try {
        const { data } = await supabase
          .from('org_memberships')
          .select('organization_id, organizations(plan_type, grandfathered_lifetime)')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        const org = (data as { organizations?: { plan_type?: string; grandfathered_lifetime?: boolean } } | null)
          ?.organizations;
        const next: PlanState = {
          planType: (org?.plan_type as PlanType) ?? 'free',
          grandfathered: !!org?.grandfathered_lifetime,
          loading: false,
        };
        cachedKey = userId;
        cachedState = next;
        setState(next);
      } catch {
        // Fail open to current behavior — never gate a feature because
        // of a transient lookup error.
        const next: PlanState = { planType: 'free', grandfathered: true, loading: false };
        if (!cancelled) {
          cachedState = next;
          setState(next);
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
