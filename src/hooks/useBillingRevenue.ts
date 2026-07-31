import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Platform revenue, read from `billing_revenue_by_confidence` and nothing else.
 *
 * That view's COMMENT is a specification, not documentation, and this hook exists
 * to honour it:
 *
 *   "THE reporting surface for platform revenue. Do not report off billing_events
 *    directly. Population is pinned: WHERE counts_as_cash … Counts and amounts are
 *    drawn from the same rows, so events and net_cash_cents can never describe
 *    different populations … event_type is deliberately NOT in the grain —
 *    filtering to charge.succeeded was how one tier was reported gross of a $49
 *    dispute while the others were net. Use gross_cents / reversal_cents when a
 *    gross figure is wanted; do not reconstruct one with a WHERE clause."
 *
 * So: no query against billing_events, no filtering by event_type anywhere, and no
 * arithmetic beyond summing the columns the view already computed.
 */

export type RevenueStream = 'plan' | 'merchant_cleaning' | 'ai_credits' | 'ad_management';
export type Confidence = 'certain' | 'probable' | 'inferred';

/** The two businesses sharing one Stripe account. Never summed together. */
export const SAAS_STREAMS: RevenueStream[] = ['plan', 'ai_credits', 'ad_management'];
export const CLEANING_STREAMS: RevenueStream[] = ['merchant_cleaning'];

/** Headline figures exclude `inferred`, per the correction_confidence comment. */
export const HEADLINE_CONFIDENCE: Confidence[] = ['certain', 'probable'];

export interface RevenueRow {
  month: string;
  stream: RevenueStream;
  confidence: Confidence;
  events: number;
  payment_events: number;
  reversal_events: number;
  gross_cents: number;
  reversal_cents: number;
  net_cash_cents: number;
}

/**
 * PostgREST serialises `sum()` over bigint as a STRING, to avoid the precision loss
 * of a JSON number. Left alone, `row.gross_cents + row.gross_cents` would
 * concatenate — "1290" + "500" = "1290500" — and a revenue page is the last place
 * that should happen. Every numeric field is coerced once, here, at the boundary.
 */
const n = (v: unknown): number => {
  const parsed = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function useBillingRevenue() {
  return useQuery({
    queryKey: ['billing-revenue-by-confidence'],
    queryFn: async (): Promise<RevenueRow[]> => {
      const { data, error } = await supabase
        .from('billing_revenue_by_confidence')
        .select('*')
        .order('month', { ascending: true });

      // Deliberately NOT swallowed into []. An empty revenue page and a broken
      // one look identical, and "no revenue" is a far more alarming thing to
      // show by accident than an error message (CLAUDE.md rule 5).
      if (error) throw error;

      return (data ?? []).map((r: Record<string, unknown>) => ({
        month: String(r.month),
        stream: r.stream as RevenueStream,
        confidence: r.confidence as Confidence,
        events: n(r.events),
        payment_events: n(r.payment_events),
        reversal_events: n(r.reversal_events),
        gross_cents: n(r.gross_cents),
        reversal_cents: n(r.reversal_cents),
        net_cash_cents: n(r.net_cash_cents),
      }));
    },
  });
}

export interface Totals {
  events: number;
  gross_cents: number;
  reversal_cents: number;
  net_cash_cents: number;
  /** True when gross + reversals stops equalling net — see the note below. */
  nettingBroken: boolean;
}

/**
 * Sum a set of view rows.
 *
 * Netting is structural in the view: reversals are negative `amount_cents` rows
 * inside the same population, so `gross + reversal === net` must hold for every
 * subset. This does NOT compute net from the other two — it sums the view's own
 * `net_cash_cents` and then checks the identity, so a future change that breaks
 * the invariant surfaces as a visible warning rather than as a plausible number.
 */
export function sumRows(rows: RevenueRow[]): Totals {
  const t = rows.reduce(
    (acc, r) => ({
      events: acc.events + r.events,
      gross_cents: acc.gross_cents + r.gross_cents,
      reversal_cents: acc.reversal_cents + r.reversal_cents,
      net_cash_cents: acc.net_cash_cents + r.net_cash_cents,
    }),
    { events: 0, gross_cents: 0, reversal_cents: 0, net_cash_cents: 0 },
  );
  return { ...t, nettingBroken: t.gross_cents + t.reversal_cents !== t.net_cash_cents };
}

export type Freshness =
  | { state: 'fresh'; loadedAt: Date; ageDays: number; failedResources: string[] }
  | { state: 'stale'; loadedAt: Date; ageDays: number; failedResources: string[] }
  | { state: 'unknown'; reason: string };

const STALE_AFTER_DAYS = 3;

/**
 * When was this data last loaded?
 *
 * The page is a SNAPSHOT — new Stripe activity does not appear until the backfill
 * re-runs — so this is load-bearing rather than decorative.
 *
 * Three states, and `unknown` is the important one: a page that cannot establish
 * its own age must say so, not fall back to looking current. That is the failure
 * shape this whole page exists to avoid.
 *
 * The table GRANT this needs was missing until 2026-07-31 — the RLS policy existed
 * but `authenticated` had no SELECT privilege, and a policy only operates within
 * granted privileges, so this returned 42501 and the page sat in `unknown`.
 * Fixed by 20260731152612_212b467e…sql. Do not remove the `unknown` branch on the
 * strength of that: it is the honest state whenever the age cannot be established,
 * and it is what made the missing grant announce itself rather than being something
 * to remember.
 */
export function useBackfillFreshness() {
  return useQuery({
    queryKey: ['billing-backfill-freshness'],
    queryFn: async (): Promise<Freshness> => {
      const { data, error } = await supabase
        .from('billing_backfill_jobs')
        .select('resource, status, finished_at, last_error')
        .order('finished_at', { ascending: false });

      if (error) return { state: 'unknown', reason: error.message };
      if (!data || data.length === 0) {
        return { state: 'unknown', reason: 'No backfill has ever been recorded.' };
      }

      const newest = data
        .map((r) => (r.finished_at ? new Date(r.finished_at as string) : null))
        .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0];

      if (!newest) {
        return { state: 'unknown', reason: 'No backfill has completed yet.' };
      }

      const failedResources = data
        .filter((r) => r.status === 'failed')
        .map((r) => String(r.resource));

      const ageDays = Math.floor((Date.now() - newest.getTime()) / 86_400_000);
      return {
        state: ageDays >= STALE_AFTER_DAYS ? 'stale' : 'fresh',
        loadedAt: newest,
        ageDays,
        failedResources,
      };
    },
    // Freshness is itself a fact about the data; don't cache it longer than the data.
    staleTime: 60_000,
  });
}

export interface PlanPayer {
  organization_id: string | null;
  organization_name: string | null;
  customer_email: string | null;
  first_payment_at: string | null;
  last_payment_at: string | null;
  payment_events: number;
  reversal_events: number;
  gross_cents: number;
  reversal_cents: number;
  net_cash_cents: number;
  confidence_worst: Confidence;
}

/**
 * Who is paying for TidyWise, from `billing_plan_payers` and nothing else.
 *
 * PLAN STREAM ONLY. This is deliberately not the SaaS headline: `ai_credits` and
 * `ad_management` are SaaS too, so the payer list sums to LESS than the SaaS panel
 * above it. The panel says so in its subtitle — do not "fix" the gap by widening
 * this query, and above all do not widen it to `merchant_cleaning`, whose payers
 * are the cleaning customers of these businesses, an entirely different population.
 *
 * The view is `security_invoker = true`, so RLS on billing_events applies to the
 * caller: a non-platform-admin session gets zero rows, not a leak of who pays me.
 */
export function useBillingPlanPayers() {
  return useQuery({
    queryKey: ['billing-plan-payers'],
    queryFn: async (): Promise<PlanPayer[]> => {
      const { data, error } = await supabase
        .from('billing_plan_payers')
        .select('*')
        .order('net_cash_cents', { ascending: false });

      if (error) throw error;

      return (data ?? []).map((r: Record<string, unknown>) => ({
        organization_id: (r.organization_id as string) ?? null,
        organization_name: (r.organization_name as string) ?? null,
        customer_email: (r.customer_email as string) ?? null,
        first_payment_at: (r.first_payment_at as string) ?? null,
        last_payment_at: (r.last_payment_at as string) ?? null,
        payment_events: n(r.payment_events),
        reversal_events: n(r.reversal_events),
        gross_cents: n(r.gross_cents),
        reversal_cents: n(r.reversal_cents),
        net_cash_cents: n(r.net_cash_cents),
        confidence_worst: (r.confidence_worst as Confidence) ?? 'inferred',
      }));
    },
  });
}
