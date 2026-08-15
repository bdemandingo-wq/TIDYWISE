/**
 * Eligibility, vesting and bonus arithmetic for the org-to-org referral
 * programme. Pure functions only — no Supabase, no Stripe, no clock — so the
 * rules that decide who gets paid are testable without a network.
 *
 * KEEP IN SYNC: `supabase/functions/_shared/referral-eligibility.ts` is a
 * verbatim copy below its header, because the webhook and the reward granter
 * run in Deno and cannot import from `src/`. Same arrangement as
 * automation-templates.ts and phone.ts.
 *
 * ─── THE RULE THAT MATTERS MOST ────────────────────────────────────────────
 * The referrer's reward vests on the referred org's SECOND successful payment.
 * Never the first. Of the 13 subscriptions in the only cohort old enough to
 * have completed, 3 (23%) never reached a second payment — those are exactly
 * the referrals that must cost nothing. Granting on the first payment turns a
 * one-month customer into a break-even acquisition at best.
 * ───────────────────────────────────────────────────────────────────────────
 */

export interface ReferralParty {
  orgId: string;
  ownerId: string;
  /** `organizations.plan_type`. Null for an org that has not chosen a plan. */
  planType: string | null;
  /** Stripe `payment_method_details.card.fingerprint`. Null until they pay. */
  cardFingerprint: string | null;
}

/**
 * Plans with no monthly bill. A lifetime org cannot redeem a free month and
 * cannot be given a percentage off a charge that never recurs, so it is out of
 * scope on both sides rather than half-supported.
 */
const NON_MONTHLY_PLANS = new Set(['lifetime']);

/**
 * Can an org on this plan take part at all?
 *
 * Exported so the UI can hide the panel from a lifetime org using the SAME set
 * that rejectReason gates on, rather than a second copy of the plan list that
 * has to be kept in step by memory.
 *
 * A null plan_type is IN scope: a brand-new org has not chosen a plan yet, and
 * rejectReason treats null the same way.
 */
export function isMonthlyPlan(planType: string | null): boolean {
  if (!planType) return true;
  return !NON_MONTHLY_PLANS.has(planType);
}

/** Subscription states in which a referral still counts toward the bonus. */
const LIVE_SUBSCRIPTION_STATES = new Set(['active', 'trialing']);

/** Referral states that can never come back. */
const DEAD_REFERRAL_STATES = new Set(['rejected', 'expired']);

const BONUS_THRESHOLD = 3;
const BONUS_MONTHS = 2;
const VESTING_PAYMENTS = 2;

/**
 * Null when the pair may earn; otherwise a machine-readable reason, stored on
 * the referral row so a false positive can be found and reversed later.
 *
 * Order matters: the identity checks run before the plan checks so that a
 * self-referral is reported as self-referral rather than as a plan problem.
 */
export function rejectReason(
  referrer: ReferralParty,
  referred: ReferralParty,
): string | null {
  if (referrer.orgId === referred.orgId) return 'self_referral_same_org';

  if (referrer.ownerId && referred.ownerId && referrer.ownerId === referred.ownerId) {
    return 'self_referral_owner';
  }

  // Both truthy AND equal. Two nulls mean "neither has paid yet", which is the
  // normal state at claim time — treating that as a match would reject every
  // referral in the system before anyone had a chance to pay.
  if (
    referrer.cardFingerprint &&
    referred.cardFingerprint &&
    referrer.cardFingerprint === referred.cardFingerprint
  ) {
    return 'self_referral_card';
  }

  // A null plan_type is a brand-new org that has not picked a plan. In scope.
  if (referrer.planType && NON_MONTHLY_PLANS.has(referrer.planType)) {
    return 'referrer_not_monthly';
  }
  if (referred.planType && NON_MONTHLY_PLANS.has(referred.planType)) {
    return 'referred_not_monthly';
  }

  return null;
}

/**
 * Has the referred org paid enough for the referrer's month to vest?
 *
 * "Successful payment" is counted as an `invoice.paid` with `amount_paid > 0`,
 * NOT `billing_reason === 'subscription_create'`: with the 7-day trial, Stripe
 * issues a $0 invoice at creation and the first real charge arrives as
 * `subscription_cycle`. Counting positive-amount paid invoices is correct
 * whether or not a trial is involved.
 */
export function isVested(paidInvoiceCount: number): boolean {
  return paidInvoiceCount >= VESTING_PAYMENTS;
}

/**
 * Does this referral still count toward the three-referral bonus?
 *
 * Re-evaluated at every vesting event rather than once, because a referral can
 * fall out of good standing between converting and the third one arriving.
 */
export function isInGoodStanding(r: {
  status: string;
  paidInvoiceCount: number;
  subscriptionStatus: string;
}): boolean {
  if (DEAD_REFERRAL_STATES.has(r.status)) return false;
  if (!isVested(r.paidInvoiceCount)) return false;
  return LIVE_SUBSCRIPTION_STATES.has(r.subscriptionStatus);
}

/**
 * The bonus months owed for reaching three referrals in good standing.
 *
 * ADDITIONAL to the per-referral months, not instead of them: three referrals
 * earn 3 + 2 = 5. One-time — a fourth, fifth or sixth referral still earns its
 * own month but never a second bonus.
 */
export function bonusMonthsOwed(
  goodStandingCount: number,
  bonusAlreadyGranted: boolean,
): number {
  if (bonusAlreadyGranted) return 0;
  return goodStandingCount >= BONUS_THRESHOLD ? BONUS_MONTHS : 0;
}

/**
 * Unredeemed months, which becomes a Stripe coupon's `duration_in_months`.
 *
 * Clamped at zero: redemption is counted from webhook events, so a double-fire
 * can push redeemed past granted. That must read as "nothing owed" rather than
 * producing a negative duration, which Stripe rejects outright.
 */
export function monthsOwed(granted: number, redeemed: number): number {
  return Math.max(0, granted - redeemed);
}
