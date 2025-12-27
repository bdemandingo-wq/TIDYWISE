-- Allow staff users to read their own staff row (needed for staff portal and for other staff RLS subqueries)
DO $$
BEGIN
  CREATE POLICY "Staff can view own record"
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Allow staff users to read bookings in their organization that are either:
-- 1) unassigned (available jobs) OR
-- 2) assigned to them (their jobs + history)
DO $$
BEGIN
  CREATE POLICY "Staff can view org bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_active = true
        AND s.organization_id = bookings.organization_id
    )
    AND (
      bookings.staff_id IS NULL
      OR bookings.staff_id IN (
        SELECT s2.id
        FROM public.staff s2
        WHERE s2.user_id = auth.uid()
          AND s2.organization_id = bookings.organization_id
      )
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
