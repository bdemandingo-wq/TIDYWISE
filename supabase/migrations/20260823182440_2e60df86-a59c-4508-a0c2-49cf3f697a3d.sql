-- ROLLBACK of the bookings/customers RLS tightening

-- Remove the tightened policies added by the previous migration
DROP POLICY IF EXISTS "Admins can manage org bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can view assigned bookings" ON public.bookings;
DROP POLICY IF EXISTS "Managers can view org customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can view customers for assigned bookings" ON public.customers;

-- Restore the original broad org-member policies
DROP POLICY IF EXISTS "Authenticated org members can manage bookings" ON public.bookings;
CREATE POLICY "Authenticated org members can manage bookings"
ON public.bookings
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = bookings.organization_id
      AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = bookings.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Authenticated org members can view customers" ON public.customers;
CREATE POLICY "Authenticated org members can view customers"
ON public.customers
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = customers.organization_id
      AND m.user_id = auth.uid()
  )
);

-- Restore the prior staff visibility on bookings (org-scoped active staff)
DROP POLICY IF EXISTS "Staff can view org bookings" ON public.bookings;
CREATE POLICY "Staff can view org bookings"
ON public.bookings
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = bookings.organization_id
  )
);

-- Restore the prior staff visibility on customers
DROP POLICY IF EXISTS "Staff can view org customers" ON public.customers;
CREATE POLICY "Staff can view org customers"
ON public.customers
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = customers.organization_id
  )
);
