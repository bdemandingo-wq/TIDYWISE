-- The trigger ran as the caller, so a payout recorded by a role without UPDATE
-- on bookings aborted the insert (or, under RLS, could have locked only the rows
-- that caller could see — a partial seal is worse than none). Definer, scoped
-- hard to NEW.organization_id, which the payout row itself already authorizes.
CREATE OR REPLACE FUNCTION public.stamp_payroll_locked_week()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.release_payroll_locked_week()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Trigger functions only; nothing may call them through the API.
REVOKE EXECUTE ON FUNCTION public.stamp_payroll_locked_week() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_payroll_locked_week() FROM PUBLIC, anon, authenticated;