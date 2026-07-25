-- Fix cleaner_location_tracking policies so staff can only access their own
-- location rows, not every staff member's GPS data in the organization.
-- Admins retain org-wide visibility.

-- Revoke overly broad staff policies.
DROP POLICY IF EXISTS "Staff can view own tracking" ON public.cleaner_location_tracking;
DROP POLICY IF EXISTS "Staff can insert their own tracking" ON public.cleaner_location_tracking;
DROP POLICY IF EXISTS "Staff can update their own tracking" ON public.cleaner_location_tracking;

-- Create staff-owned policies.
CREATE POLICY "Staff can view own tracking"
  ON public.cleaner_location_tracking
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = cleaner_location_tracking.staff_id
        AND s.user_id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE POLICY "Staff can insert their own tracking"
  ON public.cleaner_location_tracking
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = cleaner_location_tracking.staff_id
        AND s.user_id = auth.uid()
        AND s.is_active = true
    )
  );

CREATE POLICY "Staff can update their own tracking"
  ON public.cleaner_location_tracking
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = cleaner_location_tracking.staff_id
        AND s.user_id = auth.uid()
        AND s.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = cleaner_location_tracking.staff_id
        AND s.user_id = auth.uid()
        AND s.is_active = true
    )
  );
