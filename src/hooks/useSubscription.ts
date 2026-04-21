/**
 * useSubscription – derives feature-level access from the auth subscription state.
 *
 * Free / trial-expired users are "limited mode":
 *   • Max 5 customers
 *   • No SMS campaigns
 *   • No OpenPhone integration
 *   • No AI Intelligence
 *   • No advanced reports / finance
 *
 * Accounts in FREE_ACCOUNTS always get full access.
 */

import { useAuth } from './useAuth';
import { Capacitor } from '@capacitor/core';

const FREE_ACCOUNTS = [
  'support@tidywisecleaning.com',
  'applereview@tidywise.com',
  'info@openarmscleaning.com',
  'applereview@tidywise1.com',
];

/** Demo/review accounts that bypass subscription enforcement entirely */
function isDemoAccount(email: string | undefined): boolean {
  if (!email) return false;
  return FREE_ACCOUNTS.includes(email) || email.endsWith('@tidywise1.com');
}

export interface SubscriptionAccess {
  /** True only if user has a confirmed active Stripe subscription */
  isSubscribed: boolean;
  /** True if the user is on an active trial that has NOT expired */
  isTrialActive: boolean;
  /** True if the user has full (paid or free-account) access */
  hasFullAccess: boolean;
  /** Whether the subscription data has loaded yet */
  isLoading: boolean;

  /* Feature-level gates */
  canAccessCampaigns: boolean;
  canAccessOpenPhone: boolean;
  canAccessAIIntelligence: boolean;
  canAccessReports: boolean;
  canAccessFinance: boolean;
  canAccessClientPortal: boolean;
  canAccessInventory: boolean;
  canAccessExpenses: boolean;
  canAccessBookingPhotos: boolean;

  /** Max customers allowed (Infinity for full access) */
  maxCustomers: number;
}

export function useSubscription(): SubscriptionAccess {
  const { user, subscription, loading } = useAuth();

  // On native platforms (iOS/Android), all users get full access.
  // Subscription billing is managed on the web — no IAP needed.
  const isNativeApp = Capacitor.isNativePlatform();

  const isFreeAccount = isDemoAccount(user?.email ?? '');
  const isSubscribed = subscription?.subscribed === true;
  const isTrialActive = subscription?.trial_active === true;
  const hasFullAccess = isNativeApp || isFreeAccount || isSubscribed || isTrialActive;

  return {
    isSubscribed,
    isTrialActive,
    hasFullAccess,
    isLoading: !isNativeApp && (loading || subscription === null),

    canAccessCampaigns: hasFullAccess,
    canAccessOpenPhone: hasFullAccess,
    canAccessAIIntelligence: hasFullAccess,
    canAccessReports: hasFullAccess,
    canAccessFinance: hasFullAccess,
    canAccessClientPortal: hasFullAccess,
    canAccessInventory: hasFullAccess,
    canAccessExpenses: hasFullAccess,
    canAccessBookingPhotos: hasFullAccess,

    maxCustomers: hasFullAccess ? Infinity : 5,
  };
}
