-- ============================================================================
-- ORPHANED PAY SHARES — READ ONLY. Changes nothing.
-- ============================================================================
-- Extracted from the release_own_job prompt, which is cancelled. This part is
-- not: it is live money today and has nothing to do with that feature.
--
-- WHAT IT LOOKS FOR
-- A booking_team_assignments row carrying a pay_share for a cleaner who is no
-- longer the cleaner on that booking, where the cleaner who IS on the booking
-- has no assignment row at all.
--
-- WHY THAT COSTS MONEY
-- resolveCleanerPay (src/lib/wageCalculation.ts) and the payout engine
-- (_shared/payroll-period-process.ts) both read pay_share FIRST, ahead of
-- cleaner_pay_expected, cleaner_actual_payment and the computed fallback. So a
-- stale row is not a cosmetic leftover — it is the number payroll pays. The
-- cleaner who left the job keeps getting paid for it, and the one who actually
-- did it falls through to whatever the computed path produces.
--
-- HOW THEY GET THERE
-- Reassigning a booking has to move the assignment as well as bookings.staff_id.
-- BookingDialogs.tsx:499-503 does that now, via syncCleanerPayShare's
-- nextStaffId argument — and its own comment records what happened before that
-- argument existed: "the row stayed with the previous cleaner while
-- bookings.staff_id pointed at the new one, so payroll paid both, and the
-- previous cleaner's pay_share was overwritten with the new cleaner's pay."
-- Every reassignment from before that fix is a candidate.
--
-- WHAT IS DELIBERATELY NOT FLAGGED
--   * genuine multi-cleaner bookings — an assignment for someone other than
--     bookings.staff_id is normal there. Excluded by requiring that the
--     booking's own cleaner has NO assignment row.
--   * bookings with staff_id IS NULL — a team booking with no primary is a
--     different shape and not necessarily wrong.
--   * pay_share of 0 or null — not set, so nothing is being paid from it.
-- ============================================================================


-- ── 1. THE HEADLINE. Is this happening at all, and for how much? ────────────
select
  count(*)                                   as orphaned_rows,
  count(distinct t.staff_id)                 as cleaners_affected,
  count(distinct b.organization_id)          as orgs_affected,
  round(sum(t.pay_share)::numeric, 2)        as total_at_stake_usd,
  min(b.scheduled_at)::date                  as oldest,
  max(b.scheduled_at)::date                  as newest
from public.booking_team_assignments t
join public.bookings b on b.id = t.booking_id
where b.staff_id is not null
  and b.staff_id <> t.staff_id
  and coalesce(t.pay_share, 0) > 0
  and not exists (
    select 1 from public.booking_team_assignments t2
    where t2.booking_id = b.id and t2.staff_id = b.staff_id
  );

--  0 rows / zero count → clean. The fix at BookingDialogs:499 held, and nothing
--                        predates it. Nothing to do.
--  anything > 0        → each row is a cleaner being paid for a job that moved
--                        away from them. total_at_stake_usd is the money.


-- ── 2. WHO, AND WHOSE JOB IT ACTUALLY IS ────────────────────────────────────
select
  o.name                                     as organization,
  b.booking_number,
  b.scheduled_at::date                       as job_date,
  b.status,
  paid_to.name                               as pay_share_sits_with,
  round(t.pay_share::numeric, 2)             as pay_share_usd,
  actually_did_it.name                       as booking_now_assigned_to,
  round(coalesce(b.cleaner_pay_expected, 0)::numeric, 2) as booking_snapshot_usd
from public.booking_team_assignments t
join public.bookings b            on b.id = t.booking_id
join public.organizations o       on o.id = b.organization_id
left join public.staff paid_to    on paid_to.id = t.staff_id
left join public.staff actually_did_it on actually_did_it.id = b.staff_id
where b.staff_id is not null
  and b.staff_id <> t.staff_id
  and coalesce(t.pay_share, 0) > 0
  and not exists (
    select 1 from public.booking_team_assignments t2
    where t2.booking_id = b.id and t2.staff_id = b.staff_id
  )
order by b.scheduled_at desc;

--  Read `pay_share_sits_with` against `booking_now_assigned_to`. The first is
--  being paid; the second did the work. Where booking_snapshot_usd is non-zero
--  the real cleaner does at least have a figure — but pay_share still wins, so
--  they are not the one receiving it.


-- ── 3. HAS THE MONEY ALREADY GONE OUT? ──────────────────────────────────────
-- Decides whether this is a correction or a recovery. A stale row on a booking
-- in a week that was never paid can just be fixed; one in a paid week means a
-- cleaner has already banked money for someone else's job.
select
  paid_to.name                               as pay_share_sits_with,
  count(*)                                   as orphaned_rows,
  round(sum(t.pay_share)::numeric, 2)        as at_stake_usd,
  count(*) filter (where exists (
    select 1 from public.payroll_payments p
    where p.staff_id = t.staff_id
      and p.paid_at is not null
      and b.scheduled_at >= p.week_start
      and b.scheduled_at <  p.week_start + interval '7 days'
  ))                                         as in_an_already_paid_week
from public.booking_team_assignments t
join public.bookings b         on b.id = t.booking_id
left join public.staff paid_to on paid_to.id = t.staff_id
where b.staff_id is not null
  and b.staff_id <> t.staff_id
  and coalesce(t.pay_share, 0) > 0
  and not exists (
    select 1 from public.booking_team_assignments t2
    where t2.booking_id = b.id and t2.staff_id = b.staff_id
  )
group by paid_to.name
order by sum(t.pay_share) desc nulls last;


-- ============================================================================
-- IF IT COMES BACK NON-ZERO
--
-- Do NOT bulk-repoint the rows. Deleting a stale pay_share changes what the
-- CURRENT cleaner is owed as well — they stop falling through to the computed
-- path and start resolving from whatever else the booking carries, which may
-- be a different number again. That is a payroll decision with two people's
-- money in it, and it wants the names in query 2 in front of you.
--
-- The safe order is: read query 2, decide per row what each of the two cleaners
-- should have been paid, then correct. Query 3 tells you which of those are
-- already settled and therefore a conversation rather than an edit.
-- ============================================================================
