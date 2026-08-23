-- Phase 1 (additive only). Verified inert in a rolled-back harness:
-- owner 8/19/8, Bruce 447/253/447, anon 0/0/0 both before and after.

-- 1. Helper EXECUTE for every role that can reach the tables.
--    staff_can_view_booking was missing anon; a policy that ERRORS aborts the
--    entire query even when another permissive policy would have allowed it.
GRANT EXECUTE ON FUNCTION public.staff_can_view_booking(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_view_customer(uuid, uuid) TO anon, authenticated, service_role;

-- 2. Narrow staff SELECT policy on bookings, ADDED ALONGSIDE the broad ones.
--    Permissive policies OR together, so this cannot reduce anyone's visibility.
DROP POLICY IF EXISTS "Staff can view assigned bookings" ON public.bookings;
CREATE POLICY "Staff can view assigned bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.staff_can_view_booking(id, organization_id));