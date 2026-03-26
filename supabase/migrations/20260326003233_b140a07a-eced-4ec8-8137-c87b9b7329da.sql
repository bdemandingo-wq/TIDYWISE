
-- ============================================================
-- MULTI-TENANT ISOLATION HARDENING
-- Fix RLS policies that lack organization_id enforcement
-- ============================================================

-- 1. staff_documents: DELETE policy needs org check
DROP POLICY IF EXISTS "Staff delete own documents" ON public.staff_documents;
CREATE POLICY "Staff delete own documents"
  ON public.staff_documents FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = staff_documents.organization_id
    )
  );

-- 2. staff_documents: INSERT policy needs org check
DROP POLICY IF EXISTS "Staff insert own documents" ON public.staff_documents;
CREATE POLICY "Staff insert own documents"
  ON public.staff_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = staff_documents.organization_id
    )
  );

-- 3. staff_documents: VIEW policy needs org check
DROP POLICY IF EXISTS "Staff view own documents" ON public.staff_documents;
CREATE POLICY "Staff view own documents"
  ON public.staff_documents FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = staff_documents.organization_id
    )
  );

-- 4. staff_signatures: INSERT needs org check
DROP POLICY IF EXISTS "Staff can insert own signatures" ON public.staff_signatures;
CREATE POLICY "Staff can insert own signatures"
  ON public.staff_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = staff_signatures.organization_id
    )
  );

-- 5. staff_signatures: VIEW needs org check
DROP POLICY IF EXISTS "Staff can view own signatures" ON public.staff_signatures;
CREATE POLICY "Staff can view own signatures"
  ON public.staff_signatures FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = staff_signatures.organization_id
    )
  );

-- 6. staff_payout_accounts: Staff SELECT/UPDATE/INSERT need org check via staff table
DROP POLICY IF EXISTS "Staff can view own payout account" ON public.staff_payout_accounts;
CREATE POLICY "Staff can view own payout account"
  ON public.staff_payout_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_payout_accounts.staff_id
        AND s.user_id = auth.uid()
        AND s.organization_id = staff_payout_accounts.organization_id
    )
  );

DROP POLICY IF EXISTS "Staff can update own payout account" ON public.staff_payout_accounts;
CREATE POLICY "Staff can update own payout account"
  ON public.staff_payout_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_payout_accounts.staff_id
        AND s.user_id = auth.uid()
        AND s.organization_id = staff_payout_accounts.organization_id
    )
  );

DROP POLICY IF EXISTS "Staff can insert own payout account" ON public.staff_payout_accounts;
CREATE POLICY "Staff can insert own payout account"
  ON public.staff_payout_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_payout_accounts.staff_id
        AND s.user_id = auth.uid()
        AND s.organization_id = staff_payout_accounts.organization_id
    )
  );

-- 7. staff_event_notifications: Fix overly permissive INSERT policy
-- Only allow inserts from triggers (service role) or org admins
DROP POLICY IF EXISTS "System can insert staff notifications" ON public.staff_event_notifications;
CREATE POLICY "Org admins can insert staff notifications"
  ON public.staff_event_notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

-- 8. Add DELETE policy for staff_event_notifications (admin only)
CREATE POLICY "Admins can delete org staff notifications"
  ON public.staff_event_notifications FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));
