# Lovable prompt — option 3: freeze cleaner pay at deactivation

**Status:** ready to paste, but **run the sizing query first**
(`2026-07-31-deactivated-cleaner-pay-sizing.sql`). If it comes back empty this is
still worth doing, but nothing is owed invisibly today and it can wait.

**Why option 3 and not option 1.** Option 1 (read the staff record regardless of
`is_active`) makes the screen agree with the payout engine, but both would then
be a *live lookup* — edit a former cleaner's hourly rate and historical payroll
periods change underneath you. Option 3 stops the number being a lookup at all
and makes it a recorded fact, which is the only version that leaves historical
records stable.

---

## The hazard this design exists to avoid

`bookings.cleaner_pay_expected` is **booking-level, not per-cleaner**. Writing it
for a departing cleaner sets the pay for *whoever ends up doing that job*. Snapshot
a future booking on Tuesday, reassign it to someone else on Wednesday, and the new
cleaner inherits the old one's rate without anyone choosing that.

So this snapshots **past work only**, and uses a different column depending on how
the cleaner was attached:

| Attached via | Column written | Why |
|---|---|---|
| `booking_team_assignments` | `pay_share` | Per-cleaner. No bleed, safe regardless. |
| `bookings.staff_id` (primary) | `cleaner_pay_expected` | Booking-level — hence past-only. |

**Future bookings are deliberately left alone.** A future job assigned to someone
who has just left is a scheduling problem, not a pay problem: somebody else will
do it, and their pay should compute from their own record.

---

## The prompt

````
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

GOAL: when a cleaner is deactivated, freeze what they are owed for work already
done, so the figure stops being a live lookup against a staff record the payroll
screen no longer reads.

BACKGROUND: PayrollPage excludes inactive staff from wage resolution, so a
deactivated cleaner's unsnapshotted cleans resolve to $0 and no payout button
renders. The payout engine (payroll-period-process.ts) does NOT filter on
is_active, so it would still pay them — the screen and the engine disagree. This
removes the disagreement by recording the number instead of recomputing it.

BUILD A TRIGGER, NOT FRONTEND LOGIC. Deactivation happens from the staff editor
today, but also from bulk edits and direct database changes, and every path must
snapshot. A trigger on public.staff is the only place that catches all of them.

CREATE OR REPLACE FUNCTION public.snapshot_pay_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours    numeric;
  v_rate     numeric;
  v_type     text;
  v_pay      numeric;
  r          record;
BEGIN
  -- Only on the active → inactive transition. Not on every staff UPDATE, and
  -- not when reactivating.
  IF NOT (OLD.is_active = true AND NEW.is_active = false) THEN
    RETURN NEW;
  END IF;

  -- ── 1. Team assignments: write pay_share (per-cleaner, cannot bleed) ──────
  FOR r IN
    SELECT t.id AS assignment_id, b.*
    FROM public.booking_team_assignments t
    JOIN public.bookings b ON b.id = t.booking_id
    WHERE t.staff_id = NEW.id
      AND coalesce(t.pay_share, 0) <= 0
      AND b.status <> 'cancelled'
      AND b.scheduled_at < now()                      -- past work only
      AND b.cleaner_pay_expected IS NULL
      AND b.cleaner_actual_payment IS NULL
      AND NOT (b.service_id IS NULL AND coalesce(b.total_amount, 0) = 0)
  LOOP
    v_type := lower(coalesce(r.cleaner_wage_type, 'hourly'));
    v_rate := coalesce(r.cleaner_wage, NEW.base_wage, NEW.hourly_rate, 0);

    v_hours := CASE
      WHEN r.cleaner_checkin_at IS NOT NULL
       AND r.cleaner_checkout_at IS NOT NULL
       AND r.cleaner_checkout_at > r.cleaner_checkin_at
      THEN EXTRACT(EPOCH FROM (r.cleaner_checkout_at - r.cleaner_checkin_at)) / 3600.0
      WHEN r.cleaner_override_hours IS NOT NULL THEN r.cleaner_override_hours
      WHEN NEW.default_hours IS NOT NULL         THEN NEW.default_hours
      ELSE r.duration / 60.0
    END;

    v_pay := CASE v_type
      WHEN 'flat'       THEN v_rate
      WHEN 'percentage' THEN (v_rate / 100.0) *
        CASE WHEN r.subtotal IS NOT NULL
             THEN r.subtotal - coalesce(r.discount_amount, 0)
             ELSE coalesce(r.total_amount, 0) END
      ELSE v_rate * v_hours
    END;

    UPDATE public.booking_team_assignments
    SET pay_share = round(v_pay, 2)
    WHERE id = r.assignment_id;
  END LOOP;

  -- ── 2. Primary cleaner: write cleaner_pay_expected ───────────────────────
  -- PAST ONLY, and this is the important part. cleaner_pay_expected is
  -- booking-level, so writing it for a FUTURE job would set the pay for
  -- whoever is reassigned to it. Do not widen this to future bookings.
  FOR r IN
    SELECT b.*
    FROM public.bookings b
    WHERE b.staff_id = NEW.id
      AND b.status <> 'cancelled'
      AND b.scheduled_at < now()
      AND b.cleaner_pay_expected IS NULL
      AND b.cleaner_actual_payment IS NULL
      AND NOT (b.service_id IS NULL AND coalesce(b.total_amount, 0) = 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_team_assignments t
        WHERE t.booking_id = b.id AND t.staff_id = NEW.id
      )
  LOOP
    v_type := lower(coalesce(r.cleaner_wage_type, 'hourly'));
    v_rate := coalesce(r.cleaner_wage, NEW.base_wage, NEW.hourly_rate, 0);

    v_hours := CASE
      WHEN r.cleaner_checkin_at IS NOT NULL
       AND r.cleaner_checkout_at IS NOT NULL
       AND r.cleaner_checkout_at > r.cleaner_checkin_at
      THEN EXTRACT(EPOCH FROM (r.cleaner_checkout_at - r.cleaner_checkin_at)) / 3600.0
      WHEN r.cleaner_override_hours IS NOT NULL THEN r.cleaner_override_hours
      WHEN NEW.default_hours IS NOT NULL         THEN NEW.default_hours
      ELSE r.duration / 60.0
    END;

    v_pay := CASE v_type
      WHEN 'flat'       THEN v_rate
      WHEN 'percentage' THEN (v_rate / 100.0) *
        CASE WHEN r.subtotal IS NOT NULL
             THEN r.subtotal - coalesce(r.discount_amount, 0)
             ELSE coalesce(r.total_amount, 0) END
      ELSE v_rate * v_hours
    END;

    UPDATE public.bookings
    SET cleaner_pay_expected = round(v_pay, 2)
    WHERE id = r.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_pay_on_deactivation ON public.staff;
CREATE TRIGGER trg_snapshot_pay_on_deactivation
  AFTER UPDATE OF is_active ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_pay_on_deactivation();

COMMENT ON FUNCTION public.snapshot_pay_on_deactivation() IS
'Freezes a cleaner''s pay for work ALREADY DONE at the moment they are
deactivated. PayrollPage excludes inactive staff from wage resolution, so
without this their unsnapshotted cleans resolve to $0 with no way to pay them
from the page.

PAST WORK ONLY, deliberately. cleaner_pay_expected is booking-level, so writing
it for a future booking would set the pay for whoever is reassigned to that job.
Team assignments get pay_share instead, which is per-cleaner and cannot bleed.

The wage maths mirrors _shared/payroll-period-process.ts. If that engine changes,
change this too or a snapshot will stop matching what the engine would have paid.';

MATCH THE ENGINE EXACTLY. The CASE expressions above mirror
_shared/payroll-period-process.ts: nullish (not falsy) coalescing on the rate so
an explicit wage of 0 stays 0; check-in/out only when the pair is valid and
forward-ordered; subtotal-minus-discount only when subtotal is populated,
otherwise total_amount. Do not "simplify" any of those — each one is a bug that
was already fixed once.

AFTERWARDS please paste:

  -- 1. Nothing should have changed yet: this only fires on future deactivations.
  select count(*) as already_snapshotted
  from public.bookings where cleaner_pay_expected is not null;

  -- 2. Confirm the trigger is attached and the definition is what you think.
  select tgname, tgenabled from pg_trigger
  where tgrelid = 'public.staff'::regclass and not tgisinternal;

  select pg_get_functiondef('public.snapshot_pay_on_deactivation()'::regprocedure);

Confirm the migration RAN, not just that a file was created.
````

---

## What this does NOT do, on purpose

**It does not backfill.** Cleaners already deactivated keep showing $0 until
someone acts on them. That is deliberate: a backfill would write pay figures for
historical periods that may already have been paid out by other means, and it
would do so using today's rate on the staff record — the exact live-lookup
problem this is meant to end. If the sizing query shows a real population, do the
backfill as its own decision with the numbers in front of you.

**It does not change the payout engine.** The engine already computes these
correctly. After this trigger, the engine finds a snapshot and uses it, which is
the same number it would have computed at that moment.

**It does not touch `PayrollPage`'s `is_active` filter.** With a snapshot present,
`resolveCleanerPay` returns at step 2 and never consults the staff record, so the
filter stops mattering for anyone deactivated after this ships.
