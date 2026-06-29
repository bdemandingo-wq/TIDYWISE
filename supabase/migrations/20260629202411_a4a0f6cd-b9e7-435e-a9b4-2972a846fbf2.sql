
-- ============================================================
-- 1. abandoned_bookings: tighten anonymous INSERT
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert abandoned bookings" ON public.abandoned_bookings;

CREATE POLICY "Anyone can insert abandoned bookings with org"
ON public.abandoned_bookings
FOR INSERT
TO anon, authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id)
  AND (
    (email IS NOT NULL AND length(trim(email)) > 0)
    OR (first_name IS NOT NULL AND length(trim(first_name)) > 0)
  )
);

-- ============================================================
-- 2. staff: lock down SSN / EIN columns at column level
-- ============================================================
REVOKE SELECT ON public.staff FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  name,
  email,
  phone,
  avatar_url,
  bio,
  is_active,
  hourly_rate,
  created_at,
  updated_at,
  tax_classification,
  base_wage,
  tax_document_url,
  percentage_rate,
  organization_id,
  calendar_color,
  default_hours,
  home_address,
  home_latitude,
  home_longitude,
  location_permission_status,
  location_permission_updated_at
) ON public.staff TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;

-- SECURITY DEFINER function so org admins can still load SSN/EIN in the edit dialog
CREATE OR REPLACE FUNCTION public.get_staff_sensitive_fields(_staff_id uuid)
RETURNS TABLE (
  ssn_last4 text,
  ein text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.staff WHERE id = _staff_id;
  IF _org IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.is_org_admin(_org) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT s.ssn_last4, s.ein FROM public.staff s WHERE s.id = _staff_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_sensitive_fields(uuid) TO authenticated;
