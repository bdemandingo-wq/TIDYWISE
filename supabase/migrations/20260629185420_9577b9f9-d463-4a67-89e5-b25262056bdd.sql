
-- 1) Lock down Stripe secret columns
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token) ON public.org_stripe_settings FROM anon, authenticated;

-- 2) Lock down OpenPhone API key & webhook secret
REVOKE SELECT (openphone_api_key, external_booking_webhook_secret) ON public.organization_sms_settings FROM anon, authenticated;

-- 3) Lock down sensitive staff PII/payroll columns from regular org members
REVOKE SELECT (ssn_last4, ein, home_address, home_latitude, home_longitude, hourly_rate, base_wage, tax_document_url)
  ON public.staff FROM anon, authenticated;

-- 4) SECURITY DEFINER function so a staff user can read their OWN sensitive fields (used by the Staff Portal)
CREATE OR REPLACE FUNCTION public.get_my_staff_profile()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  bio text,
  avatar_url text,
  hourly_rate numeric,
  base_wage numeric,
  percentage_rate numeric,
  tax_classification text,
  default_hours numeric,
  home_address text,
  home_latitude double precision,
  home_longitude double precision,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.email, s.phone, s.bio, s.avatar_url,
         s.hourly_rate, s.base_wage, s.percentage_rate, s.tax_classification,
         s.default_hours, s.home_address, s.home_latitude, s.home_longitude,
         s.organization_id
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_staff_profile() TO authenticated;

-- 5) SECURITY DEFINER function returning the current user's own wage rates for a booking they're assigned to.
CREATE OR REPLACE FUNCTION public.get_my_wage_rates_for_booking(_booking_id uuid)
RETURNS TABLE (
  hourly_rate numeric,
  base_wage numeric,
  percentage_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.hourly_rate, s.base_wage, s.percentage_rate
  FROM public.bookings b
  JOIN public.staff s ON s.id = b.staff_id
  WHERE b.id = _booking_id
    AND s.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_wage_rates_for_booking(uuid) TO authenticated;
