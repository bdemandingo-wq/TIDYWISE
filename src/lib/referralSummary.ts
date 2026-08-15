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
        ? 'Signed up and paid once — one more payment and your free month is earned'
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
