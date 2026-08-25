-- Phase 3: narrow staff visibility on bookings and customers.
-- Helpers already have EXECUTE for anon, authenticated and service_role.

DROP POLICY IF EXISTS "Authenticated org members can manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can view org bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated org members can view customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can view org customers" ON public.customers;

-- Write paths preserved for every org member (the dropped policy was FOR ALL).
CREATE POLICY "Org members can insert bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = bookings.organization_id AND m.user_id = (SELECT auth.uid())));

CREATE POLICY "Org members can delete bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = bookings.organization_id AND m.user_id = (SELECT auth.uid())));

-- Narrow read: assigned, team-assigned or unassigned only.
CREATE POLICY "Staff can view assigned bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.staff_can_view_booking(id, organization_id));

CREATE POLICY "Staff can view assigned customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.staff_can_view_customer(id, organization_id));