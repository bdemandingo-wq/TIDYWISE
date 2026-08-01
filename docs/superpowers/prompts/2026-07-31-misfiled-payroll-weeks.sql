-- ============================================================================
-- MISFILED PAYROLL WEEKS — READ ONLY. Changes nothing.
-- ============================================================================
-- Decides whether the timezone work on PayrollPage is a FIX or a REPAIR.
--
-- PayrollPage:203 derives week_start with date-fns startOfWeek in BROWSER-LOCAL
-- time, and that string is the key used to read and write payroll_payments
-- (:246, :304, :337). An admin working from a device outside the org's timezone
-- can therefore file a payment under a different week_start than the same
-- period would get from a device inside it.
--
-- Two signatures give it away:
--   Q1  the same staff member paid twice for what should be one week, under
--       week_start values a day or two apart
--   Q2  any week_start that is not a Monday — the code hardcodes
--       weekStartsOn: 1, so a non-Monday key can only have come from a
--       device whose week boundary landed elsewhere
--
-- Q2 is the cleaner signal. Q1 can also be produced legitimately (a correction,
-- a second payout in the same week), so read it with Q3 for context.
-- ============================================================================


-- ── Q1. Near-duplicate week keys for the same staff member ──────────────────
-- Two payments whose week_start values are within 6 days of each other are
-- almost certainly the same business week filed twice.
select
  o.name                                   as organization,
  s.name                                   as staff,
  a.week_start                             as key_a,
  b.week_start                             as key_b,
  (b.week_start - a.week_start)            as days_apart,
  a.amount                                 as amount_a,
  b.amount                                 as amount_b,
  a.paid_at                                as paid_at_a,
  b.paid_at                                as paid_at_b
from public.payroll_payments a
join public.payroll_payments b
  on b.staff_id = a.staff_id
 and b.organization_id = a.organization_id
 and b.week_start > a.week_start
 and b.week_start < a.week_start + 7
left join public.staff s         on s.id = a.staff_id
left join public.organizations o on o.id = a.organization_id
order by o.name, s.name, a.week_start;


-- ── Q2. THE DECISIVE ONE. Week keys that are not a Monday ───────────────────
-- The code hardcodes weekStartsOn: 1. Any other day of week means the value was
-- produced on a device whose local week boundary differed — i.e. written from
-- outside the org's timezone.
--   dow: 0=Sunday 1=Monday … 6=Saturday
select
  o.name                                          as organization,
  bs.timezone                                     as org_timezone,
  extract(dow from pp.week_start)::int            as day_of_week,
  to_char(pp.week_start, 'Dy')                    as day_name,
  count(*)                                        as payments,
  count(distinct pp.staff_id)                     as staff_affected,
  round(sum(pp.amount)::numeric, 2)               as total_usd,
  min(pp.week_start)                              as earliest,
  max(pp.week_start)                              as latest
from public.payroll_payments pp
left join public.organizations o   on o.id = pp.organization_id
left join public.business_settings bs on bs.organization_id = pp.organization_id
group by o.name, bs.timezone, extract(dow from pp.week_start), to_char(pp.week_start, 'Dy')
order by o.name, day_of_week;

--  HEALTHY: every row day_of_week = 1 (Mon).
--  BAD:     any other day_of_week. Those rows were filed from a device whose
--           week boundary wasn't the org's. `payments` and `total_usd` size it.


-- ── Q3. Scale, for reading Q1 against ───────────────────────────────────────
select
  count(*)                                  as total_payments,
  count(distinct organization_id)           as orgs,
  count(distinct staff_id)                  as staff,
  count(distinct week_start)                as distinct_week_keys,
  min(week_start)                           as earliest_week,
  max(week_start)                           as latest_week,
  round(sum(amount)::numeric, 2)            as total_paid_usd
from public.payroll_payments;


-- ============================================================================
-- HOW TO READ IT
--
-- Q2 all Mondays, Q1 empty
--   → FIX, not repair. Nothing is misfiled; the timezone change only stops it
--     happening in future. Ship it and move on.
--
-- Q2 shows non-Mondays
--   → REPAIR. Those rows are filed under a week that does not exist in the
--     org's calendar. They will not match the keys the corrected code
--     generates, so after the fix they become invisible to the page that wrote
--     them — see "what breaks visibly" in the handover notes.
--
-- Q1 rows with Q2 clean
--   → probably legitimate: a correction, or two payouts in one week. Check
--     paid_at and amount before assuming a bug.
--
-- DO NOT rewrite any week_start on the strength of this. Changing a stored key
-- moves money between periods in the history, and a payment that appears to
-- move week is worse than one sitting under an odd key. Bring the numbers back
-- first.
-- ============================================================================
