-- =====================================================================
-- Partial refunds — Task 0 sizing. READ ONLY. Changes nothing.
-- Plan: docs/superpowers/plans/2026-07-30-refund-history-repair.md
--
-- DECISION GATE. Do not start Task 2 (the one-pass restore) until these
-- three results are in. If tier_c_lost is a large share, or if Query 2's
-- `undecidable` is high, the backfill buys less than it costs and the
-- honest move is fix-forward only, with a documented cut-off date.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. The three recovery tiers.
--
--    A: Stripe-authoritative — payment_intent_id present, so Stripe holds
--       the original charge AND every refund with its real date.
--    B: Inferred — no payment intent, but `subtotal` survived (the refund
--       path only ever wrote payment_status and total_amount), so the
--       original is derivable. Amount yes; DATE unknown.
--    C: Lost — neither.
-- ---------------------------------------------------------------------
select
  count(*)                                                          as refund_affected,
  count(*) filter (where payment_intent_id is not null)             as tier_a_stripe,
  count(*) filter (where payment_intent_id is null
                     and coalesce(subtotal,0) > 0)                  as tier_b_inferred,
  count(*) filter (where payment_intent_id is null
                     and coalesce(subtotal,0) = 0)                  as tier_c_lost,
  sum(case when payment_intent_id is null and coalesce(subtotal,0) > 0
           then (subtotal - coalesce(discount_amount,0)) - total_amount end)
                                                                    as tier_b_refund_total_usd
from public.bookings
where payment_status in ('refunded','partial');


-- ---------------------------------------------------------------------
-- 2. The 'partial' ambiguity, in real numbers.
--
--    payment_status = 'partial' currently means BOTH "partially paid" and
--    "partially refunded" — opposite situations. A booking whose
--    total_amount sits below its derived original was refunded; one at or
--    above it was partially paid.
--
--    If `undecidable` is high, the local data cannot separate them and
--    only Stripe can — and only for the tier-A rows.
-- ---------------------------------------------------------------------
select
  count(*)                                                              as partial_rows,
  count(*) filter (where coalesce(subtotal,0) > 0
                     and total_amount < (subtotal - coalesce(discount_amount,0)) - 0.005)
                                                                        as looks_refunded,
  count(*) filter (where coalesce(subtotal,0) > 0
                     and total_amount >= (subtotal - coalesce(discount_amount,0)) - 0.005)
                                                                        as looks_partially_paid,
  count(*) filter (where coalesce(subtotal,0) = 0)                      as undecidable
from public.bookings
where payment_status = 'partial';


-- ---------------------------------------------------------------------
-- 3. Payroll exposure.
--
--    Cleaner pay comes from pay_share, then the cleaner_pay_expected
--    snapshot, then the legacy override, then a computed wage. Only the
--    last of those reads total_amount, and only for a percentage-type
--    booking-level wage. Those are the bookings whose pay would move if
--    total_amount is restored.
--
--    Expected to be 0 or near it. If it is not, restoring the sale prices
--    changes what payroll would pay, and that needs a decision first.
-- ---------------------------------------------------------------------
select count(*) as exposed_bookings
from public.bookings b
where b.cleaner_wage_type = 'percentage'
  and coalesce(b.cleaner_pay_expected, 0) = 0
  and coalesce(b.cleaner_actual_payment, 0) = 0
  and not exists (
    select 1 from public.booking_team_assignments t
    where t.booking_id = b.id and coalesce(t.pay_share, 0) > 0
  );
