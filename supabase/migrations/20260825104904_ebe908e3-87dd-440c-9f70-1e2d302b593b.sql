-- 1. Columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at_source text,
  ADD COLUMN IF NOT EXISTS payroll_locked_week date,
  ADD COLUMN IF NOT EXISTS payroll_needs_review boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_completed_at_source_check') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_completed_at_source_check
      CHECK (completed_at_source IS NULL OR completed_at_source IN
        ('checkout','trigger','inferred_updated_at','scheduled_fallback','sealed_week_locked','manual'));
  END IF;
END $$;

-- The single date payroll attributes a job to. Generated so no query can forget
-- the COALESCE and quietly fall back to scheduled_at on its own.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payroll_date timestamptz
  GENERATED ALWAYS AS (COALESCE(completed_at, scheduled_at)) STORED;

CREATE INDEX IF NOT EXISTS idx_bookings_org_payroll_date
  ON public.bookings (organization_id, payroll_date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_payroll_review
  ON public.bookings (organization_id) WHERE payroll_needs_review;
CREATE INDEX IF NOT EXISTS idx_bookings_payroll_locked_week
  ON public.bookings (organization_id, payroll_locked_week);

-- 2. Stamp completed_at when a job actually completes.
CREATE OR REPLACE FUNCTION public.set_booking_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Guard 1: a job inside a sealed (already paid) week is never re-dated.
  IF NEW.payroll_locked_week IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := COALESCE(NEW.cleaner_checkout_at, now());
    NEW.completed_at_source := CASE
      WHEN NEW.cleaner_checkout_at IS NOT NULL THEN 'checkout'
      ELSE 'trigger'
    END;
  END IF;

  -- Un-completing a job clears the stamp so it cannot linger in a pay run.
  IF TG_OP = 'UPDATE'
     AND NEW.status <> 'completed'
     AND OLD.status = 'completed'
     AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at THEN
    NEW.completed_at := NULL;
    NEW.completed_at_source := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_completed_at ON public.bookings;
CREATE TRIGGER trg_set_booking_completed_at
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_completed_at();

-- 3. Guard 2: once locked, nothing may re-attribute the row.
CREATE OR REPLACE FUNCTION public.guard_booking_payroll_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.payroll_locked_week IS NOT NULL
     AND (NEW.completed_at IS DISTINCT FROM OLD.completed_at
          OR NEW.payroll_locked_week IS DISTINCT FROM OLD.payroll_locked_week
          OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at)
     AND COALESCE(current_setting('app.allow_payroll_reattribution', true), 'off') <> 'on'
  THEN
    RAISE EXCEPTION
      'Booking % is locked to payroll week % and cannot be re-attributed. Undo that payout first.',
      OLD.id, OLD.payroll_locked_week
      USING ERRCODE = '55006';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_payroll_lock ON public.bookings;
CREATE TRIGGER trg_guard_booking_payroll_lock
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_payroll_lock();

-- 4. Guard 3: recording a payout seals that week's jobs for that cleaner.
CREATE OR REPLACE FUNCTION public.stamp_payroll_locked_week()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.bookings b
     SET payroll_locked_week = NEW.week_start
   WHERE b.organization_id = NEW.organization_id
     AND b.payroll_locked_week IS NULL
     AND b.status = 'completed'
     AND b.payroll_date >= NEW.week_start::timestamptz
     AND b.payroll_date <  (NEW.week_start + 7)::timestamptz
     AND (
       b.staff_id = NEW.staff_id
       OR EXISTS (
         SELECT 1 FROM public.booking_team_assignments t
          WHERE t.booking_id = b.id AND t.staff_id = NEW.staff_id
       )
     );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_payroll_locked_week ON public.payroll_payments;
CREATE TRIGGER trg_stamp_payroll_locked_week
  AFTER INSERT ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_payroll_locked_week();

-- Undoing a payout releases the lock, so the week can be recomputed.
CREATE OR REPLACE FUNCTION public.release_payroll_locked_week()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_payroll_reattribution', 'on', true);
  UPDATE public.bookings b
     SET payroll_locked_week = NULL
   WHERE b.organization_id = OLD.organization_id
     AND b.payroll_locked_week = OLD.week_start
     AND NOT EXISTS (
       SELECT 1 FROM public.payroll_payments p
        WHERE p.organization_id = OLD.organization_id
          AND p.week_start = OLD.week_start
          AND p.id <> OLD.id
          AND (p.staff_id = b.staff_id
               OR EXISTS (SELECT 1 FROM public.booking_team_assignments t
                           WHERE t.booking_id = b.id AND t.staff_id = p.staff_id))
     );
  PERFORM set_config('app.allow_payroll_reattribution', 'off', true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_payroll_locked_week ON public.payroll_payments;
CREATE TRIGGER trg_release_payroll_locked_week
  AFTER DELETE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.release_payroll_locked_week();