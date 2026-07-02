
-- 1) client_portal_sessions: drop public insert, add admin delete
DROP POLICY IF EXISTS "Public can insert client sessions" ON public.client_portal_sessions;
CREATE POLICY "Service role inserts client sessions"
  ON public.client_portal_sessions FOR INSERT
  TO service_role WITH CHECK (true);
CREATE POLICY "Org admins can delete client sessions"
  ON public.client_portal_sessions FOR DELETE
  USING (is_org_admin(organization_id));

-- 2) platform_notifications: use is_platform_admin()
DROP POLICY IF EXISTS "Platform admins can read notifications" ON public.platform_notifications;
CREATE POLICY "Platform admins can read notifications"
  ON public.platform_notifications FOR SELECT
  USING (is_platform_admin());

-- 3) score_claim_requests: platform admin SELECT
CREATE POLICY "Platform admins can read claim requests"
  ON public.score_claim_requests FOR SELECT
  USING (is_platform_admin());

-- 4) SET search_path on the 4 flagged SECURITY DEFINER functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
