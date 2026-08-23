CREATE OR REPLACE FUNCTION public.staff_owns_assignment(_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = _staff_id AND s.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.staff_owns_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_owns_assignment(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Staff can view their own team assignments" ON public.booking_team_assignments;
CREATE POLICY "Staff can view their own team assignments"
ON public.booking_team_assignments
FOR SELECT
USING (public.staff_owns_assignment(staff_id));