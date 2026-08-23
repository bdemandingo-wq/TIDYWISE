-- Widen staff_can_view_customer to mirror staff_can_view_booking exactly.
--
-- Measured gap: Bruce could see 181 bookings but only 154 of them resolved
-- their embedded customers row. The missing 27 are all unassigned jobs
-- (staff_id IS NULL) -- visible as bookings, invisible as customers. Every
-- staff surface embeds customers(...) on bookings, so that mismatch renders
-- as a job with no customer.
--
-- Three visibility arms, identical to staff_can_view_booking:
--   1. the job is unassigned
--   2. the caller is the assigned staff
--   3. the caller is on the booking's team assignments
CREATE OR REPLACE FUNCTION public.staff_can_view_customer(_customer_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = _org_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.customer_id = _customer_id
      AND b.organization_id = _org_id
      AND (
        b.staff_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.staff s2
          WHERE s2.id = b.staff_id AND s2.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.booking_team_assignments bta
          JOIN public.staff s3 ON s3.id = bta.staff_id
          WHERE bta.booking_id = b.id AND s3.user_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_can_view_customer(uuid, uuid) TO anon, authenticated, service_role;