CREATE OR REPLACE FUNCTION public.staff_can_view_booking_v2(_staff_id uuid, _booking_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
COST 500
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id = _org_id
      AND s.is_active = true
      AND (
        _staff_id = s.id
        OR _staff_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.booking_team_assignments bta
          WHERE bta.booking_id = _booking_id
            AND bta.staff_id = s.id
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.staff_can_view_booking_v2(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_view_booking_v2(uuid,uuid,uuid) TO authenticated, service_role;

ALTER POLICY "Staff can view assigned bookings" ON public.bookings
  USING (public.is_org_operator(organization_id) OR public.staff_can_view_booking_v2(staff_id, id, organization_id));