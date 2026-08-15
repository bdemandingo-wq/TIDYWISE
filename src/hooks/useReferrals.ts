import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { monthsOwed, isMonthlyPlan } from '@/lib/referralEligibility';
import { summariseReferrals, type ReferralRow, type ReferralCounts } from '@/lib/referralSummary';

export interface ReferralListRow extends ReferralRow {
  id: string;
  created_at: string;
  referred_second_payment_at: string | null;
}

export interface ReferralOverview {
  code: string | null;
  rows: ReferralListRow[];
  counts: ReferralCounts;
  monthsGranted: number;
  monthsRedeemed: number;
  monthsRemaining: number;
  bonusGranted: boolean;
  eligible: boolean;
}

/**
 * TEMPORARY BRIDGE — delete when types.ts catches up.
 *
 * `src/integrations/supabase/types.ts` is generated from the live schema and
 * does not yet contain org_referral_codes / org_referrals /
 * org_referral_credits / org_referral_bonuses. Task 3's migration IS applied —
 * verified against the live database — but regenerating the types requires
 * Lovable, so the generated file still predates it.
 *
 * Every query below is valid at runtime; PostgREST does not consult TypeScript.
 * Without this cast the file simply cannot compile.
 *
 * REMOVE THIS and use `supabase` directly once the four tables appear in
 * types.ts. If you are reading this and they do, that is the whole task.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Everything the Settings → Referrals panel renders, in one query key.
 *
 * Reads only. Every write to the org_referral* tables happens server-side —
 * those tables carry SELECT policies and nothing else, because organizations'
 * INSERT policy does not enumerate columns and anything a client can write, a
 * client can forge.
 *
 * NOTE FOR ANYONE EXTENDING THIS: the result must stay JSON-safe. The query
 * cache is persisted to localStorage, and JSON.stringify flattens a Map or Set
 * to {} — it then rehydrates as a plain object and throws on the next .get().
 * Return arrays and plain objects only.
 */
export function useReferrals() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const planType = (organization as { plan_type?: string | null } | null)?.plan_type ?? null;

  // A lifetime org has no monthly bill, so it can neither earn a free month
  // nor redeem one. Same predicate rejectReason gates on, not a second copy.
  const eligible = isMonthlyPlan(planType);

  return useQuery<ReferralOverview>({
    queryKey: ['referrals', orgId],
    enabled: !!orgId && eligible,
    queryFn: async () => {
      const [codeRes, rowsRes, creditsRes, bonusRes] = await Promise.all([
        db
          .from('org_referral_codes')
          .select('code')
          .eq('organization_id', orgId!)
          .maybeSingle(),
        db
          .from('org_referrals')
          .select('id, status, rejection_reason, referred_paid_invoice_count, referred_second_payment_at, created_at')
          .eq('referrer_org_id', orgId!)
          // Unique tiebreaker alongside the timestamp: created_at is not
          // unique, so ordering by it alone can shuffle rows between reads.
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
        db
          .from('org_referral_credits')
          .select('months_granted, months_redeemed')
          .eq('organization_id', orgId!)
          .maybeSingle(),
        db
          .from('org_referral_bonuses')
          .select('id')
          .eq('organization_id', orgId!)
          .maybeSingle(),
      ]);

      // Deliberately not swallowed into an empty panel. An owner seeing "no
      // referrals yet" when the query actually failed is the failure mode this
      // repo has been bitten by; let react-query surface the error instead.
      if (codeRes.error) throw codeRes.error;
      if (rowsRes.error) throw rowsRes.error;
      if (creditsRes.error) throw creditsRes.error;
      if (bonusRes.error) throw bonusRes.error;

      const rows = (rowsRes.data ?? []) as ReferralListRow[];
      const granted = creditsRes.data?.months_granted ?? 0;
      const redeemed = creditsRes.data?.months_redeemed ?? 0;

      return {
        code: codeRes.data?.code ?? null,
        rows,
        counts: summariseReferrals(rows),
        monthsGranted: granted,
        monthsRedeemed: redeemed,
        monthsRemaining: monthsOwed(granted, redeemed),
        bonusGranted: !!bonusRes.data,
        eligible,
      };
    },
  });
}
