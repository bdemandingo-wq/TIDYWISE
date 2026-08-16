// Display logic for the referral panel: the shareable link, the status copy,
// and the counts an owner sees.
//
//   node --experimental-strip-types --test src/lib/referralSummary.test.ts
//
// THE CONTROL. Almost every assertion here is about a zero, an empty state, or
// a row NOT counting. A summariser that returned all-zeros regardless of input
// would satisfy them, and the panel would tell an owner they have no referrals
// while the ledger says otherwise — the worst failure this feature can have,
// because it is indistinguishable from "nobody used my link":
//
//   "counts real rows" — proves non-zero output is reachable
//
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  referralLink,
  summariseReferrals,
  referralStatusLabel,
  REFERRAL_TERMS,
  type ReferralRow,
} from './referralSummary.ts';
import { isMonthlyPlan } from './referralEligibility.ts';

const row = (o: Partial<ReferralRow> = {}): ReferralRow => ({
  status: 'pending',
  rejection_reason: null,
  referred_paid_invoice_count: 0,
  ...o,
});

// ─── the shareable link ─────────────────────────────────────────────────────

test('the link carries the code as ?ref=', () => {
  assert.equal(
    referralLink('ABC23456', 'https://jointidywise.com'),
    'https://jointidywise.com/?ref=ABC23456',
  );
});

test('a trailing slash on the origin does not double up', () => {
  assert.equal(
    referralLink('ABC23456', 'https://jointidywise.com/'),
    'https://jointidywise.com/?ref=ABC23456',
  );
});

test('CONTROL: a different code produces a different link', () => {
  const a = referralLink('ABC23456', 'https://x.com');
  const b = referralLink('XYZ98765', 'https://x.com');
  assert.notEqual(a, b);
  assert.match(b, /ref=XYZ98765$/);
});

test('no code means no link to show', () => {
  assert.equal(referralLink(null, 'https://x.com'), null);
  assert.equal(referralLink('', 'https://x.com'), null);
});

// ─── the counts ─────────────────────────────────────────────────────────────

test('an empty ledger is all zeros', () => {
  const s = summariseReferrals([]);
  assert.deepEqual(s, { total: 0, pending: 0, qualified: 0, rewarded: 0, rejected: 0 });
});

test('CONTROL: counts real rows', () => {
  // Without this, a summariser returning all zeros passes every other test in
  // this file and the panel silently under-reports every owner's referrals.
  const s = summariseReferrals([
    row({ status: 'pending' }),
    row({ status: 'pending' }),
    row({ status: 'qualified', referred_paid_invoice_count: 2 }),
    row({ status: 'rewarded', referred_paid_invoice_count: 3 }),
    row({ status: 'rejected', rejection_reason: 'self_referral_card' }),
  ]);
  assert.deepEqual(s, { total: 5, pending: 2, qualified: 1, rewarded: 1, rejected: 1 });
});

test('an unrecognised status still counts toward the total', () => {
  // Status is a CHECK constraint today, but a future value must not silently
  // vanish from the total and make the numbers disagree with the table.
  const s = summariseReferrals([row({ status: 'expired' })]);
  assert.equal(s.total, 1);
  assert.equal(s.pending + s.qualified + s.rewarded + s.rejected, 0);
});

// ─── the copy an owner reads ────────────────────────────────────────────────

test('status copy explains what is happening, in the owner\'s terms', () => {
  assert.match(referralStatusLabel(row({ status: 'pending', referred_paid_invoice_count: 0 })), /signed up/i);
  assert.match(referralStatusLabel(row({ status: 'pending', referred_paid_invoice_count: 1 })), /one more/i);
  assert.match(referralStatusLabel(row({ status: 'qualified' })), /earned/i);
  assert.match(referralStatusLabel(row({ status: 'rewarded' })), /applied/i);
});

test('a rejected referral does not leak WHY to the referrer', () => {
  // rejection_reason can be 'self_referral_card', which would tell one org
  // something about another org's payment method. The owner sees a neutral
  // string; the reason stays in the table for support.
  const label = referralStatusLabel(row({ status: 'rejected', rejection_reason: 'self_referral_card' }));
  assert.doesNotMatch(label, /card|fingerprint|self/i);
  assert.match(label, /not eligible/i);
});

test('the vesting rule is visible, not a surprise', () => {
  // An owner whose referral paid once should be able to see that one more
  // payment is needed, rather than wondering why nothing happened.
  const label = referralStatusLabel(row({ status: 'pending', referred_paid_invoice_count: 1 }));
  assert.match(label, /payment/i);
});

// ─── the terms an owner reads BEFORE they share ─────────────────────────────
//
// These assertions exist because the panel originally stated two of the three
// rules and revealed the bonus only AFTER it had been earned. Someone deciding
// whether to share could not see it. Each rule is pinned here so it cannot be
// dropped or softened without a test failing.

test('all three rules are stated', () => {
  assert.equal(REFERRAL_TERMS.length, 3);
});

test('the referred side is told what THEY get', () => {
  const joined = REFERRAL_TERMS.join(' ');
  assert.match(joined, /50%/);
  assert.match(joined, /first month/i);
});

test('THE VESTING RULE IS STATED PLAINLY — this is the important one', () => {
  // Without it someone refers a friend, sees no free month, and concludes the
  // feature is broken. The word "second" is what does the work; a vague
  // "once they subscribe" would be worse than saying nothing.
  const joined = REFERRAL_TERMS.join(' ');
  assert.match(joined, /second payment/i);
});

test('the three-referral bonus is visible before it is earned', () => {
  const joined = REFERRAL_TERMS.join(' ');
  assert.match(joined, /three/i);
  assert.match(joined, /two (extra |more |additional )?months/i);
});

test('CONTROL: the three terms are distinct', () => {
  // A terms array holding the same sentence three times would satisfy every
  // "joined text mentions X" assertion above.
  assert.equal(new Set(REFERRAL_TERMS).size, 3);
});

test('CONTROL: no rule is an empty string', () => {
  for (const t of REFERRAL_TERMS) {
    assert.ok(t.trim().length > 10, `term too short to be a real sentence: ${JSON.stringify(t)}`);
  }
});

// ─── scope ──────────────────────────────────────────────────────────────────

test('lifetime orgs cannot participate; monthly and unset can', () => {
  assert.equal(isMonthlyPlan('lifetime'), false);
  assert.equal(isMonthlyPlan('basic'), true);
  assert.equal(isMonthlyPlan('pro'), true);
  // A brand-new org has not chosen a plan yet — in scope, matching the
  // treatment rejectReason already gives a null plan_type.
  assert.equal(isMonthlyPlan(null), true);
});
