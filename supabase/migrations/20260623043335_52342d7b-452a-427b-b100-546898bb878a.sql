
-- Restrict SELECT on sensitive columns for 3 tables by revoking table-level SELECT
-- and re-granting SELECT on the safe (non-secret) columns only.
-- Writes (INSERT/UPDATE/DELETE) remain granted so admin UIs can still save data.

-- 1) client_portal_users: hide password_hash
REVOKE SELECT ON public.client_portal_users FROM authenticated;
REVOKE SELECT ON public.client_portal_users FROM anon;
GRANT SELECT
  (id, customer_id, username, must_change_password, is_active,
   last_login_at, created_at, updated_at, organization_id)
  ON public.client_portal_users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_portal_users TO authenticated;
GRANT ALL ON public.client_portal_users TO service_role;

-- 2) org_gmail_connections: hide access_token + refresh_token_encrypted
REVOKE SELECT ON public.org_gmail_connections FROM authenticated;
REVOKE SELECT ON public.org_gmail_connections FROM anon;
GRANT SELECT
  (id, organization_id, google_email, access_token_expires_at, scopes,
   connected_by_user_id, connected_at, last_refreshed_at, last_send_at,
   status, created_at, updated_at)
  ON public.org_gmail_connections TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.org_gmail_connections TO authenticated;
GRANT ALL ON public.org_gmail_connections TO service_role;

-- 3) organization_email_settings: hide resend_api_key
REVOKE SELECT ON public.organization_email_settings FROM authenticated;
REVOKE SELECT ON public.organization_email_settings FROM anon;
GRANT SELECT
  (id, organization_id, from_name, from_email, reply_to_email,
   email_footer, created_at, updated_at)
  ON public.organization_email_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.organization_email_settings TO authenticated;
GRANT ALL ON public.organization_email_settings TO service_role;

-- Helper RPC so admins can tell whether a Resend API key is configured
-- without ever seeing the key value.
CREATE OR REPLACE FUNCTION public.org_has_resend_api_key(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_email_settings s
    WHERE s.organization_id = p_org_id
      AND s.resend_api_key IS NOT NULL
      AND length(trim(s.resend_api_key)) > 0
      AND public.is_org_admin(p_org_id)
  );
$$;
GRANT EXECUTE ON FUNCTION public.org_has_resend_api_key(uuid) TO authenticated;
