-- Allow staff users to claim an unassigned job (update staff_id from NULL to themselves)
DO $$
BEGIN
  CREATE POLICY "Staff can claim unassigned jobs"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    -- job must currently be unassigned
    staff_id IS NULL
    -- must belong to staff's organization
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.organization_id = bookings.organization_id
    )
  )
  WITH CHECK (
    -- new staff_id must be their own staff record
    staff_id IN (
      SELECT s.id
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = bookings.organization_id
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow staff users to update bookings already assigned to them (status changes, check-in/out)
DO $$
BEGIN
  CREATE POLICY "Staff can update own jobs"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    staff_id IN (
      SELECT s.id
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.organization_id = bookings.organization_id
    )
  )
  WITH CHECK (
    staff_id IN (
      SELECT s.id
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = bookings.organization_id
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow staff users to view services in their organization (needed to display service names on jobs)
DO $$
BEGIN
  CREATE POLICY "Staff can view services in their org"
  ON public.services
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT s.organization_id
      FROM public.staff s
      WHERE s.user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow staff to view customers in their organization (needed to display customer name on jobs)
DO $$
BEGIN
  CREATE POLICY "Staff can view customers in their org"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT s.organization_id
      FROM public.staff s
      WHERE s.user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow staff to view review requests for them (CleanerReviews component)
DO $$
BEGIN
  CREATE POLICY "Staff can view own reviews"
  ON public.review_requests
  FOR SELECT
  TO authenticated
  USING (
    staff_id IN (
      SELECT s.id
      FROM public.staff s
      WHERE s.user_id = auth.uid()
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
