
CREATE OR REPLACE FUNCTION public.guard_booking_financial_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / internal jobs (no JWT) and org operators keep full access.
  IF auth.uid() IS NULL OR public.is_org_operator(NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.cleaner_pay_expected IS DISTINCT FROM OLD.cleaner_pay_expected
     OR NEW.cleaner_actual_payment IS DISTINCT FROM OLD.cleaner_actual_payment THEN
    RAISE EXCEPTION 'Only owners, managers or admins can change payment or pay fields on a booking'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_booking_financial_fields ON public.bookings;
CREATE TRIGGER guard_booking_financial_fields
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_financial_fields();

CREATE OR REPLACE FUNCTION public.guard_staff_compensation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_org_admin(NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
     OR NEW.base_wage IS DISTINCT FROM OLD.base_wage
     OR NEW.percentage_rate IS DISTINCT FROM OLD.percentage_rate
     OR NEW.tax_classification IS DISTINCT FROM OLD.tax_classification
     OR NEW.ssn_last4 IS DISTINCT FROM OLD.ssn_last4
     OR NEW.ein IS DISTINCT FROM OLD.ein
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only org admins or owners can change compensation, tax or access fields on a staff record'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_staff_compensation_fields ON public.staff;
CREATE TRIGGER guard_staff_compensation_fields
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_compensation_fields();
