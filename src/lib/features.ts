/**
 * Feature gating for the four-tier pricing model.
 *
 * Single source of truth for "which plan unlocks which feature". Every
 * feature has a minimum tier; higher tiers automatically include
 * everything lower tiers have.
 *
 * Grandfathered orgs (any user who was active before the pricing
 * launch) bypass all gates — they always get every feature, even if
 * their plan_type happens to be 'basic' on paper. That way we can
 * shuffle plan_type around later without losing their access.
 */

export type PlanType =
  // New tiers (what new signups get)
  | 'basic'
  | 'pro'
  | 'custom'
  | 'lifetime'
  // Legacy / non-tiered values (kept so the column doesn't break)
  | 'trial'
  | 'standard'
  | 'free'
  | 'enterprise';

export type FeatureKey =
  // ── Basic tier (always included) ──────────────────────────────────────
  | 'bookings'
  | 'customers'
  | 'recurring_bookings'
  | 'scheduler'
  | 'estimates'
  | 'invoices'
  | 'payments'
  | 'staff'
  | 'settings'
  | 'notifications'
  | 'messages'
  | 'services'
  | 'help'
  | 'checklists'
  // ── Pro tier (Pro / Custom / Lifetime) ────────────────────────────────
  | 'automation_center'
  | 'ai_intelligence'
  | 'campaigns'
  | 'reports'
  | 'benchmarks'
  | 'operations_tracker'
  | 'tracking'
  | 'inventory'
  | 'expenses'
  | 'booking_photos'
  | 'client_feedback'
  | 'payroll'
  | 'data_import'
  | 'client_portal'
  | 'tasks'
  | 'leads'
  | 'discounts_advanced'
  | 'disputes'
  | 'copilot'
  // ── Custom tier only (NOT lifetime — lifetime gets all features but no
  //    included done-for-you work; that's a Custom-tier benefit) ─────────
  | 'custom_work_requests'
  // ── Add-on (anyone on a paid plan can buy) ────────────────────────────
  | 'ad_management';

type RequiredTier = 'basic' | 'pro' | 'custom' | 'any_paid';

const FEATURE_MIN_TIER: Record<FeatureKey, RequiredTier> = {
  // Basic
  bookings: 'basic',
  customers: 'basic',
  recurring_bookings: 'basic',
  scheduler: 'basic',
  estimates: 'basic',
  invoices: 'basic',
  payments: 'basic',
  staff: 'basic',
  settings: 'basic',
  notifications: 'basic',
  messages: 'basic',
  services: 'basic',
  help: 'basic',
  checklists: 'basic',
  // Pro
  automation_center: 'pro',
  ai_intelligence: 'pro',
  campaigns: 'pro',
  reports: 'pro',
  benchmarks: 'pro',
  operations_tracker: 'pro',
  tracking: 'pro',
  inventory: 'pro',
  expenses: 'pro',
  booking_photos: 'pro',
  client_feedback: 'pro',
  payroll: 'pro',
  data_import: 'pro',
  client_portal: 'pro',
  tasks: 'pro',
  leads: 'pro',
  discounts_advanced: 'pro',
  disputes: 'pro',
  copilot: 'pro',
  // Custom only
  custom_work_requests: 'custom',
  // Add-on
  ad_management: 'any_paid',
};

// Higher rank = more features. 'lifetime' shares Pro/Custom feature
// access but is paid once; custom-work is gated separately below.
const PLAN_RANK: Record<PlanType, number> = {
  // Legacy values map to whatever makes most sense:
  free: 0,
  trial: 2, // trial behaved like Pro before; preserve that until they convert
  standard: 2, // legacy 'standard' = the old single paid tier = Pro
  enterprise: 3, // enterprise = top-tier access
  // New tiers
  basic: 1,
  pro: 2,
  custom: 3,
  lifetime: 3,
};

const TIER_RANK: Record<RequiredTier, number> = {
  basic: 1,
  pro: 2,
  custom: 3,
  any_paid: 1, // any paid plan suffices (Basic and up)
};

export interface PlanContext {
  planType: PlanType;
  /**
   * @deprecated No longer consulted. Grandfathered orgs are resolved to
   * planType 'lifetime' by public.effective_plan, which grants every
   * feature except custom_work_requests. Kept only so existing callers
   * still compile; safe to remove once they stop passing it.
   */
  grandfathered: boolean;
}

export function canAccess(
  featureKey: FeatureKey,
  ctx: PlanContext,
): boolean {
  // Custom-work requests are a paid-Custom benefit only. Nobody else gets
  // them — not lifetime, not grandfathered, not comped, not trialing.
  // Done-for-you work costs real hours, so it tracks an actual paid Custom
  // subscription rather than feature tier.
  //
  // There used to be a blanket `if (ctx.grandfathered) return true` above
  // this, which handed grandfathered orgs custom work as a side effect and
  // contradicted the tier spec. Removing it changes nothing else: every
  // other feature tops out at TIER_RANK 3, and effective_plan resolves
  // grandfathered orgs to 'lifetime', which is PLAN_RANK 3.
  if (featureKey === 'custom_work_requests') {
    return ctx.planType === 'custom';
  }

  const userRank = PLAN_RANK[ctx.planType] ?? 0;
  const requiredRank = TIER_RANK[FEATURE_MIN_TIER[featureKey]];
  return userRank >= requiredRank;
}

/** Returns the minimum plan a user must upgrade TO to unlock a feature. */
export function minimumPlanFor(featureKey: FeatureKey): 'basic' | 'pro' | 'custom' {
  const tier = FEATURE_MIN_TIER[featureKey];
  if (tier === 'any_paid') return 'basic';
  return tier;
}

/** Human-friendly plan label for upgrade prompts. */
export function planLabel(plan: 'basic' | 'pro' | 'custom' | 'lifetime'): string {
  switch (plan) {
    case 'basic':
      return 'Basic';
    case 'pro':
      return 'Pro';
    case 'custom':
      return 'Custom';
    case 'lifetime':
      return 'Lifetime';
  }
}

/** Display price for the upgrade prompt CTA. */
export function planPriceLabel(plan: 'basic' | 'pro' | 'custom' | 'lifetime'): string {
  switch (plan) {
    case 'basic':
      return '$49/mo';
    case 'pro':
      return '$97/mo';
    case 'custom':
      return '$197/mo';
    case 'lifetime':
      return '$300 one-time';
  }
}
