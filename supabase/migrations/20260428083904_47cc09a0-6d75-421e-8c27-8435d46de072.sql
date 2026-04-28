
-- ============================================================
-- 1) demo_bookings PII lockdown
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read demo booking slots" ON public.demo_bookings;
DROP POLICY IF EXISTS "Authenticated users can update demo bookings" ON public.demo_bookings;
DROP POLICY IF EXISTS "Authenticated users can delete demo bookings" ON public.demo_bookings;

-- Public can still INSERT (for demo booking submissions)
-- (existing "Anyone can insert demo bookings" policy stays)

-- Platform admins can read/update/delete all demo bookings
CREATE POLICY "Platform admin can read demo bookings"
  ON public.demo_bookings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
    OR (auth.jwt() ->> 'email') = 'support@tidywisecleaning.com'
    OR public.is_platform_blog_admin()
  );

CREATE POLICY "Platform admin can update demo bookings"
  ON public.demo_bookings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
    OR (auth.jwt() ->> 'email') = 'support@tidywisecleaning.com'
    OR public.is_platform_blog_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
    OR (auth.jwt() ->> 'email') = 'support@tidywisecleaning.com'
    OR public.is_platform_blog_admin()
  );

CREATE POLICY "Platform admin can delete demo bookings"
  ON public.demo_bookings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'::app_role
    )
    OR (auth.jwt() ->> 'email') = 'support@tidywisecleaning.com'
    OR public.is_platform_blog_admin()
  );

-- Public RPC to read date+time slots only (no PII) for the booking widget
CREATE OR REPLACE FUNCTION public.get_demo_booked_slots()
RETURNS TABLE(booked_date date, booked_time text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT booked_date, booked_time
  FROM public.demo_bookings
  WHERE status IN ('confirmed','pending')
$$;

GRANT EXECUTE ON FUNCTION public.get_demo_booked_slots() TO anon, authenticated;

-- ============================================================
-- 2) staff SSN/EIN/tax document column-level lockdown
--    Drop the broad org-member SELECT policy and replace with
--    a policy that allows org members to SELECT only when they
--    are NOT querying sensitive columns. We enforce this by
--    revoking column privileges on ssn_last4/ein/tax_document_url
--    from non-admin members via a security-definer helper view.
-- ============================================================

-- The existing 'staff_safe' view already excludes sensitive cols.
-- Replace member SELECT policy with admin-only for the base table.
DROP POLICY IF EXISTS "Authenticated org members can view staff" ON public.staff;

-- Org admins can see everything on staff (incl. SSN/EIN)
CREATE POLICY "Org admins can view staff base table"
  ON public.staff FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- Staff can still view their own row (so they see their own SSN if needed)
-- (existing "Staff can view own record" policy stays)

-- Non-admin org members must use the staff_safe view (no sensitive cols).
-- The view runs with security_invoker; ensure it has its own SELECT policy
-- by granting on the view directly.
GRANT SELECT ON public.staff_safe TO authenticated;

-- ============================================================
-- 3) Cleanup: drop temporary cron-secret helper RPCs
--    These were one-shot helpers; vault entry is set, no need to keep.
-- ============================================================
DROP FUNCTION IF EXISTS public.vault_create_cron_secret(text);
DROP FUNCTION IF EXISTS public.vault_update_cron_secret(text);
