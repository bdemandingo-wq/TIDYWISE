-- ============================================================================
-- DEACTIVATED CLEANER PAY — SIZING. READ ONLY. Changes nothing.
-- ============================================================================
-- Decides whether the $0-pay problem is live or latent, and therefore whether
-- option 3 (snapshot pay at deactivation) is worth building now.
--
-- WHAT IT COUNTS
-- (booking, cleaner) pairs where the cleaner is deactivated AND the pay falls
-- through to the computed path, which reads staff.base_wage / hourly_rate — a
-- record PayrollPage deliberately does not consult for inactive staff, so the
-- figure resolves to $0 and no payout button renders.
--
-- WHY IT ENUMERATES PAIRS RATHER THAN BOOKINGS
-- A cleaner can be attached to a job two ways, and an earlier version of this
-- query only checked one:
--
--   • bookings.staff_id                — the primary cleaner
--   • booking_team_assignments         — multi-cleaner jobs
--
-- A deactivated cleaner on a team booking with no pay_share was invisible to
-- the staff_id-only version, so an empty result would have read as "nothing to
-- worry about" while missing exactly the case most likely to lack a snapshot.
-- The `pairs` CTE mirrors how PayrollPage builds its member list: every team
-- assignment, PLUS the primary staff_id when it is not already among them.
--
-- THREE EXCLUSIONS, EACH FOR A REASON
--   • cancelled bookings   — PayrollPage skips them; counting them would inflate.
--   • recleans             — a job with no service_id and total_amount = 0 pays
--                            $0 on purpose. Counting them as gaps would bury the
--                            real ones in noise.
--   • pay_share > 0        — that cleaner has their own figure; the staff record
--                            is never consulted, so deactivation cannot affect it.
-- ============================================================================

with pairs as (
  -- Every team-assigned cleaner.
  select t.booking_id,
         t.staff_id,
         coalesce(t.pay_share, 0) as pay_share,
         'team'::text             as attached_via
  from public.booking_team_assignments t
  where t.staff_id is not null

  union all

  -- The primary cleaner, only when not already present as a team member on the
  -- same booking (otherwise the pair is counted twice with the wrong pay_share).
  select b.id,
         b.staff_id,
         0,
         'primary'::text
  from public.bookings b
  where b.staff_id is not null
    and not exists (
      select 1 from public.booking_team_assignments t2
      where t2.booking_id = b.id and t2.staff_id = b.staff_id
    )
)
select
  s.name                                       as cleaner,
  p.attached_via,
  count(*)                                     as cleans_showing_zero,
  min(b.scheduled_at)::date                    as oldest,
  max(b.scheduled_at)::date                    as newest,
  count(*) filter (where b.scheduled_at > now() - interval '90 days')
                                               as in_last_90_days
from pairs p
join public.bookings b on b.id = p.booking_id
join public.staff s    on s.id = p.staff_id
where s.is_active = false
  and b.status <> 'cancelled'
  -- no per-cleaner figure
  and p.pay_share <= 0
  -- no booking-level snapshot of any kind
  and b.cleaner_pay_expected is null
  and b.cleaner_actual_payment is null
  -- not a reclean, which pays $0 by design
  and not (b.service_id is null and coalesce(b.total_amount, 0) = 0)
group by s.name, p.attached_via
order by count(*) desc, s.name;


-- ── Totals, so the headline number isn't assembled by hand ──────────────────
with pairs as (
  select t.booking_id, t.staff_id, coalesce(t.pay_share, 0) as pay_share
  from public.booking_team_assignments t
  where t.staff_id is not null
  union all
  select b.id, b.staff_id, 0
  from public.bookings b
  where b.staff_id is not null
    and not exists (select 1 from public.booking_team_assignments t2
                    where t2.booking_id = b.id and t2.staff_id = b.staff_id)
)
select
  count(*)                                   as affected_pairs,
  count(distinct p.staff_id)                 as cleaners_affected,
  count(distinct b.id)                       as bookings_affected,
  count(distinct b.organization_id)          as orgs_affected
from pairs p
join public.bookings b on b.id = p.booking_id
join public.staff s    on s.id = p.staff_id
where s.is_active = false
  and b.status <> 'cancelled'
  and p.pay_share <= 0
  and b.cleaner_pay_expected is null
  and b.cleaner_actual_payment is null
  and not (b.service_id is null and coalesce(b.total_amount, 0) = 0);


-- ── Control: is the fallback path rare in general, or common? ───────────────
-- Context for the numbers above. If most bookings carry a snapshot, the gap is
-- confined to imported / manually-created / older rows and option 3 only has to
-- handle a tail. If snapshots are rare, deactivation is a much bigger lever.
select
  count(*)                                                              as all_active_bookings,
  count(*) filter (where cleaner_pay_expected is not null)              as with_expected_snapshot,
  count(*) filter (where cleaner_pay_expected is null
                     and cleaner_actual_payment is not null)            as with_legacy_override,
  count(*) filter (where cleaner_pay_expected is null
                     and cleaner_actual_payment is null)                as no_snapshot_at_all
from public.bookings
where status <> 'cancelled';

-- ============================================================================
-- HOW TO READ IT
--
-- Query 1 empty  → latent. No deactivated cleaner currently has unsnapshotted
--                  work. Option 3 is still worth doing, but on your schedule,
--                  and no one is owed anything invisible today.
--
-- Query 1 rows   → live. Each row is a cleaner whose pay shows $0 on the
--                  Payroll page, with no payout button, for that many cleans.
--                  `in_last_90_days` separates a historical tail from something
--                  currently happening. `attached_via = 'team'` rows are the
--                  ones the earlier version of this query would have missed.
--
-- Query 3        → sizes how much of the estate depends on the computed
--                  fallback at all, which is the blast radius if the fallback
--                  is ever changed rather than snapshotted.
-- ============================================================================
