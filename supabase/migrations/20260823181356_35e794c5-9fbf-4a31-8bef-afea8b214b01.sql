CREATE OR REPLACE FUNCTION public.staff_can_view_booking(_booking_id uuid, _org_id uuid)
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
  AND (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = _booking_id AND b.staff_id IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.staff s2 ON s2.id = b.staff_id
      WHERE b.id = _booking_id AND s2.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.booking_team_assignments bta
      JOIN public.staff s3 ON s3.id = bta.staff_id
      WHERE bta.booking_id = _booking_id AND s3.user_id = auth.uid()
    )
  );
$$;

REVOKE ALL ON FUNCTION public.staff_can_view_booking(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_can_view_booking(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated org members can manage bookings" ON public.bookings;

CREATE POLICY "Admins can manage org bookings"
ON public.bookings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = bookings.organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = bookings.organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
);

DROP POLICY IF EXISTS "Staff can view org bookings" ON public.bookings;

CREATE POLICY "Staff can view assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  public.staff_can_view_booking(id, organization_id)
);

DROP POLICY IF EXISTS "Staff can update assigned bookings" ON public.bookings;

CREATE POLICY "Staff can update assigned bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = bookings.organization_id
  )
  AND (
    bookings.staff_id IN (
      SELECT s2.id FROM public.staff s2
      WHERE s2.user_id = auth.uid()
    )
    OR bookings.staff_id IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = bookings.organization_id
  )
);

DROP POLICY IF EXISTS "Authenticated org members can view customers" ON public.customers;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customers'
      AND policyname = 'Authenticated org admins have full customer access'
  ) THEN
    CREATE POLICY "Authenticated org admins have full customer access"
    ON public.customers
    FOR ALL
    TO authenticated
    USING (public.is_org_admin(organization_id))
    WITH CHECK (public.is_org_admin(organization_id));
  END IF;
END $$;

DROP POLICY IF EXISTS "Managers can view org customers" ON public.customers;

CREATE POLICY "Managers can view org customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = customers.organization_id
      AND user_id = auth.uid()
      AND role = 'manager'
  )
);

DROP POLICY IF EXISTS "Staff can view customers for assigned bookings" ON public.customers;

CREATE POLICY "Staff can view customers for assigned bookings"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.customer_id = customers.id
      AND b.organization_id = customers.organization_id
      AND public.staff_can_view_booking(b.id, b.organization_id)
  )
);