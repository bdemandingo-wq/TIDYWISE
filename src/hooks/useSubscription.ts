import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { differenceInDays, isPast } from 'date-fns';

export type SubscriptionTier = 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'past_due';

export type Feature =
  | 'ai_insights'
  | 'revenue_reports'
  | 'custom_automations'
  | 'priority_support'
  | 'custom_branding'
  | 'api_access'
  | 'dedicated_account_manager';

interface TierLimits {
  maxStaff: number; // -1 = unlimited
  maxBookingsPerMonth: number; // -1 = unlimited
  features: Feature[];
}

const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  starter: {
    maxStaff: 3,
    maxBookingsPerMonth: 50,
    features: [],
  },
  pro: {
    maxStaff: 15,
    maxBookingsPerMonth: -1,
    features: ['ai_insights', 'revenue_reports', 'custom_automations', 'priority_support'],
  },
  business: {
    maxStaff: -1,
    maxBookingsPerMonth: -1,
    features: [
      'ai_insights', 'revenue_reports', 'custom_automations', 'priority_support',
      'custom_branding', 'api_access', 'dedicated_account_manager',
    ],
  },
};

const TIER_ORDER: Record<SubscriptionTier, number> = { starter: 0, pro: 1, business: 2 };

export const TIER_PRICES: Record<SubscriptionTier, { monthly: number; annual: number }> = {
  starter: { monthly: 49, annual: 39 },
  pro: { monthly: 99, annual: 79 },
  business: { monthly: 199, annual: 159 },
};

export const FEATURE_LABELS: Record<Feature, string> = {
  ai_insights: 'AI Insights',
  revenue_reports: 'Revenue Reports',
  custom_automations: 'Custom Automations',
  priority_support: 'Priority Support',
  custom_branding: 'Custom Branding',
  api_access: 'API Access',
  dedicated_account_manager: 'Dedicated Account Manager',
};

export const FEATURE_REQUIRED_TIER: Record<Feature, SubscriptionTier> = {
  ai_insights: 'pro',
  revenue_reports: 'pro',
  custom_automations: 'pro',
  priority_support: 'pro',
  custom_branding: 'business',
  api_access: 'business',
  dedicated_account_manager: 'business',
};

export function useSubscription() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['subscription-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_status, trial_ends_at, billing_cycle, created_at')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const tier: SubscriptionTier = (profile?.subscription_tier as SubscriptionTier) || 'starter';
  const status: SubscriptionStatus = (profile?.subscription_status as SubscriptionStatus) || 'trial';
  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const billingCycle = profile?.billing_cycle || 'monthly';

  const isTrialing = status === 'trial';
  const isActive = status === 'active' || (isTrialing && trialEndsAt && !isPast(trialEndsAt));
  const trialExpired = isTrialing && trialEndsAt ? isPast(trialEndsAt) : false;
  const trialDaysRemaining = trialEndsAt ? Math.max(0, differenceInDays(trialEndsAt, new Date())) : 0;

  const limits = TIER_LIMITS[tier];

  const canUseFeature = (feature: Feature): boolean => {
    // During active trial or active subscription, check tier features
    if (!isActive && !trialExpired) return false;
    // Trial gives full access to the tier's features
    return limits.features.includes(feature);
  };

  const hasFeature = (feature: Feature): boolean => {
    return limits.features.includes(feature);
  };

  const requiredTierForFeature = (feature: Feature): SubscriptionTier => {
    return FEATURE_REQUIRED_TIER[feature];
  };

  const needsUpgrade = (requiredTier: SubscriptionTier): boolean => {
    return TIER_ORDER[tier] < TIER_ORDER[requiredTier];
  };

  return {
    tier,
    status,
    isTrialing,
    isActive,
    trialExpired,
    trialEndsAt,
    trialDaysRemaining,
    billingCycle,
    limits,
    canUseFeature,
    hasFeature,
    needsUpgrade,
    requiredTierForFeature,
    loading: isLoading,
  };
}

export function useStaffCount() {
  const { organization } = useOrganization();
  return useQuery({
    queryKey: ['staff-count', organization?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('staff')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization!.id)
        .eq('is_active', true);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organization?.id,
  });
}

export function useMonthlyBookingCount() {
  const { organization } = useOrganization();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  return useQuery({
    queryKey: ['monthly-booking-count', organization?.id, now.getMonth(), now.getFullYear()],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization!.id)
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organization?.id,
  });
}
