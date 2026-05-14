-- Security hardening migration

-- 1. Tighten client_portal_sessions: prevent admins from changing identity-binding columns
REVOKE UPDATE (client_user_id, customer_email, organization_id) ON public.client_portal_sessions FROM authenticated;

-- 2. Revoke client SELECT on highly sensitive credential columns
REVOKE SELECT (password_hash) ON public.client_portal_users FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token_encrypted) ON public.org_gmail_connections FROM authenticated, anon;

-- 3. Tighten SELECT policies to admin-only on PII / financial logs
DROP POLICY IF EXISTS "Org members can view reminder logs" ON public.booking_reminder_log;
CREATE POLICY "Org admins can view reminder logs"
ON public.booking_reminder_log
FOR SELECT
TO authenticated
USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view charge audit logs" ON public.charge_audit_log;
CREATE POLICY "Org admins can view charge audit logs"
ON public.charge_audit_log
FOR SELECT
TO authenticated
USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view abandoned bookings" ON public.abandoned_bookings;
CREATE POLICY "Org admins can view abandoned bookings"
ON public.abandoned_bookings
FOR SELECT
TO authenticated
USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view sms send log" ON public.sms_send_log;
CREATE POLICY "Org admins can view sms send log"
ON public.sms_send_log
FOR SELECT
TO authenticated
USING (is_org_admin(organization_id));