/**
 * Display logic for the referral panel — the shareable link, the counts, and
 * the copy an owner reads. Pure, so the wording and the arithmetic are pinned
 * by tests rather than by looking at the page.
 *
 * Kept out of the component for one specific reason beyond testability: the
 * status copy must NOT leak why a referral was rejected. `rejection_reason`
 * can be `self_referral_card`, which would tell one org something about
 * another org's payment method. The reason stays in the table for support;
 * the owner sees a neutral string.
 */

/**
 * The programme's rules, in the order an owner needs them.
 *
 * These live here rather than inline in the panel for one reason: they are the
 * terms of an offer, and the panel originally stated only two of the three —
 * the three-referral bonus appeared ONLY after it had already been earned, so
 * anyone deciding whether to share could not see it.
 *
 * The vesting rule is the one that must never be softened. Without "second
 * payment" stated in as many words, an owner refers someone, sees no free
 * month, and reasonably concludes the feature is broken. A vague "once they
 * subscribe" would be worse than silence, because it sets an expectation the
 * system will not meet.
 *
 * referralSummary.test.ts pins all three.
 */
export const REFERRAL_TERMS: readonly string[] = [
  'They get 50% off their first month, straight away.',
  'You get one free month once they have made their second payment, not their first.',
  'Refer three businesses that are still active and you get two extra months on top.',
];

export interface ReferralRow {
  status: string;
  rejection_reason: string | null;
  referred_paid_invoice_count: number;
}

export interface ReferralCounts {
  total: number;
  pending: number;
  qualified: number;
  rewarded: number;
  rejected: number;
}

/**
 * The URL an owner shares. Null when there is no code yet, so the caller can
 * render nothing rather than a broken link.
 */
export function referralLink(code: string | null | undefined, origin: string): string | null {
  if (!code) return null;
  return `${origin.replace(/\/+$/, '')}/?ref=${code}`;
}

/**
 * Counts by status. `total` counts every row including statuses not broken out
 * individually, so the headline number can never disagree with the table.
 */
export function summariseReferrals(rows: ReferralRow[]): ReferralCounts {
  const counts: ReferralCounts = { total: 0, pending: 0, qualified: 0, rewarded: 0, rejected: 0 };
  for (const r of rows ?? []) {
    counts.total += 1;
    if (r.status === 'pending') counts.pending += 1;
    else if (r.status === 'qualified') counts.qualified += 1;
    else if (r.status === 'rewarded') counts.rewarded += 1;
    else if (r.status === 'rejected') counts.rejected += 1;
    // Anything else — 'expired' today, whatever a future migration adds — is
    // counted in total only. Deliberately not dropped.
  }
  return counts;
}

/**
 * One line explaining where a referral stands, in the owner's terms.
 *
 * The vesting rule is stated rather than hidden: an owner whose referral has
 * paid once should see that one more payment is needed, instead of wondering
 * why nothing happened.
 */
export function referralStatusLabel(row: ReferralRow): string {
  switch (row.status) {
    case 'pending':
      return row.referred_paid_invoice_count >= 1
        ? 'Signed up and paid once. One more payment and your free month is earned.'
        : 'Signed up, not yet paid';
    case 'qualified':
      return 'Free month earned, applying to your next invoice';
    case 'rewarded':
      return 'Free month applied';
    case 'rejected':
      // Deliberately neutral. See the module header.
      return 'Not eligible';
    case 'expired':
      return 'Expired';
    default:
      return 'In progress';
  }
}
