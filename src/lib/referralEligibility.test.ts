// Eligibility, vesting and bonus arithmetic for the org-to-org referral
// programme. All pure — no Supabase, no Stripe, no clock.
//
//   node --experimental-strip-types --test src/lib/referralEligibility.test.ts
//
// THE CONTROLS THAT MATTER HERE. Every other test in this file asserts that
// something is REJECTED or that a reward is WITHHELD. A rejectReason() that
// returned a reason for everything would pass all of them, and the programme
// would silently never pay out — indistinguishable from "no one referred
// anyone" in production. Two tests exist to make that impossible:
//
//   1. "a genuine pair is accepted"        — proves acceptance is reachable
//   2. "two unpaid orgs are not a match"   — proves null is not treated as a
//      fingerprint match, which would reject every referral made before
//      either side has paid, i.e. all of them
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rejectReason,
  isVested,
  isInGoodStanding,
  bonusMonthsOwed,
  monthsOwed,
  type ReferralParty,
} from './referralEligibility.ts';

const party = (o: Partial<ReferralParty> = {}): ReferralParty => ({
  orgId: 'org-a',
  ownerId: 'user-a',
  planType: 'basic',
  cardFingerprint: 'fp-a',
  ...o,
});

/** A clean counterparty: different org, different owner, different card. */
const other = (o: Partial<ReferralParty> = {}): ReferralParty =>
  party({ orgId: 'org-b', ownerId: 'user-b', cardFingerprint: 'fp-b', ...o });

// ─── self-referral ──────────────────────────────────────────────────────────

test('an org cannot refer itself', () => {
  assert.equal(rejectReason(party(), party()), 'self_referral_same_org');
});

test('the same owner behind two orgs is rejected', () => {
  // The second-email loophole: same person, new org, new email.
  assert.equal(rejectReason(party(), other({ ownerId: 'user-a' })), 'self_referral_owner');
});

test('the same card behind two orgs is rejected', () => {
  // The strongest signal, and the reason the check runs at first payment
  // rather than at signup: a card only exists once someone has paid.
  assert.equal(rejectReason(party(), other({ cardFingerprint: 'fp-a' })), 'self_referral_card');
});

test('CONTROL: two orgs that have not paid yet are NOT a match', () => {
  // Both fingerprints are null before the first payment. Treating null as
  // equal to null would reject every referral at claim time — the feature
  // would look implemented and pay out nothing, forever.
  assert.equal(
    rejectReason(
      party({ cardFingerprint: null }),
      other({ cardFingerprint: null }),
    ),
    null,
  );
});

test('one side unpaid is not a match either', () => {
  assert.equal(rejectReason(party({ cardFingerprint: null }), other()), null);
  assert.equal(rejectReason(party(), other({ cardFingerprint: null })), null);
});

// ─── scope: monthly plans only ──────────────────────────────────────────────

test('lifetime orgs are out of scope on both sides', () => {
  // 79 of 96 orgs are lifetime with no billing_interval and no price. They
  // have no monthly bill to discount, so they can neither earn nor redeem.
  assert.equal(rejectReason(party({ planType: 'lifetime' }), other()), 'referrer_not_monthly');
  assert.equal(rejectReason(party(), other({ planType: 'lifetime' })), 'referred_not_monthly');
});

test('a null plan_type is treated as in scope, not excluded', () => {
  // A brand-new org has not chosen a plan when the code is claimed. Excluding
  // it here would reject every referral captured at signup.
  assert.equal(rejectReason(party({ planType: null }), other({ planType: null })), null);
});

test('CONTROL: a genuine pair is accepted', () => {
  // Without this, a rejectReason returning a reason for every input passes
  // every rejection test above and the programme never pays anyone.
  assert.equal(rejectReason(party(), other()), null);
});

// ─── vesting ────────────────────────────────────────────────────────────────

test('vesting requires the SECOND payment, never the first', () => {
  // This single line is the whole anti-abuse design. 23% of the completed
  // cohort never reached a second payment.
  assert.equal(isVested(0), false);
  assert.equal(isVested(1), false);
  assert.equal(isVested(2), true);
  assert.equal(isVested(7), true);
});

test('good standing needs vesting AND a live subscription AND a clean status', () => {
  const ok = { status: 'qualified', paidInvoiceCount: 2, subscriptionStatus: 'active' };
  assert.equal(isInGoodStanding(ok), true);
  assert.equal(isInGoodStanding({ ...ok, subscriptionStatus: 'trialing' }), true);

  assert.equal(isInGoodStanding({ ...ok, subscriptionStatus: 'canceled' }), false);
  assert.equal(isInGoodStanding({ ...ok, subscriptionStatus: 'past_due' }), false);
  assert.equal(isInGoodStanding({ ...ok, paidInvoiceCount: 1 }), false);
  assert.equal(isInGoodStanding({ ...ok, status: 'rejected' }), false);
  assert.equal(isInGoodStanding({ ...ok, status: 'expired' }), false);
});

// ─── the three-referral bonus ───────────────────────────────────────────────

test('the bonus pays two months at the third good-standing referral', () => {
  assert.equal(bonusMonthsOwed(0, false), 0);
  assert.equal(bonusMonthsOwed(2, false), 0);
  assert.equal(bonusMonthsOwed(3, false), 2);
});

test('the bonus is one-time, not one per three', () => {
  // "Three referrals earns an additional two months" — once. A per-three
  // reading would pay 2 more at 6, which the economics do not support.
  assert.equal(bonusMonthsOwed(6, false), 2);
  assert.equal(bonusMonthsOwed(9, false), 2);
  assert.equal(bonusMonthsOwed(3, true), 0);
  assert.equal(bonusMonthsOwed(99, true), 0);
});

test('the bonus is ADDITIONAL to the months already earned', () => {
  // Three referrals = 3 individual months + 2 bonus = 5. The bonus helper
  // returns only its own 2; the caller adds it to the per-referral grants.
  const perReferral = 3;
  assert.equal(perReferral + bonusMonthsOwed(3, false), 5);
});

// ─── the months ledger ──────────────────────────────────────────────────────

test('months owed is granted minus redeemed', () => {
  assert.equal(monthsOwed(3, 1), 2);
  assert.equal(monthsOwed(5, 0), 5);
  assert.equal(monthsOwed(1, 1), 0);
});

test('months owed never goes negative', () => {
  // Redemption is counted from Stripe invoices. If a webhook double-fires,
  // redeemed can exceed granted — that must read as "nothing owed", not as a
  // negative duration_in_months, which Stripe would reject outright.
  assert.equal(monthsOwed(1, 5), 0);
  assert.equal(monthsOwed(0, 3), 0);
});
