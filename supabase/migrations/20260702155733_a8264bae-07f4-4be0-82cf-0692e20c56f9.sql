
-- Prevent staff (non-admins) from altering financial/pay/status columns on bookings and staff rows
-- via their permissive self-update RLS policies. Enforced with BEFORE UPDATE triggers.

CREATE OR REPLACE FUNCTION public.guard_bookings_financial_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- Service role / no auth context (edge functions, cron) -> allow.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Org admins/owners for this booking's org may change financial fields.
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.user_id = v_uid
      AND m.organization_id = NEW.organization_id
      AND m.role IN ('owner','admin')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admins (including assigned staff) must not modify protected columns.
  IF NEW.cleaner_pay_expected IS DISTINCT FROM OLD.cleaner_pay_expected
     OR NEW.pay_base_amount   IS DISTINCT FROM OLD.pay_base_amount
     OR NEW.pay_locked        IS DISTINCT FROM OLD.pay_locked
     OR NEW.total_amount      IS DISTINCT FROM OLD.total_amount
     OR NEW.payment_status    IS DISTINCT FROM OLD.payment_status
  THEN
    RAISE EXCEPTION 'Not authorized to modify financial fields on bookings'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_bookings_financial_updates ON public.bookings;
CREATE TRIGGER trg_guard_bookings_financial_updates
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_bookings_financial_updates();


CREATE OR REPLACE FUNCTION public.guard_staff_wage_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.user_id = v_uid
      AND m.organization_id = NEW.organization_id
      AND m.role IN ('owner','admin')
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.base_wage          IS DISTINCT FROM OLD.base_wage
     OR NEW.hourly_rate     IS DISTINCT FROM OLD.hourly_rate
     OR NEW.percentage_rate IS DISTINCT FROM OLD.percentage_rate
     OR NEW.tax_classification IS DISTINCT FROM OLD.tax_classification
     OR NEW.ssn_last4       IS DISTINCT FROM OLD.ssn_last4
     OR NEW.ein             IS DISTINCT FROM OLD.ein
     OR NEW.is_active       IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Not authorized to modify wage, tax, or active status fields on staff'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_staff_wage_updates ON public.staff;
CREATE TRIGGER trg_guard_staff_wage_updates
BEFORE UPDATE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.guard_staff_wage_updates();
