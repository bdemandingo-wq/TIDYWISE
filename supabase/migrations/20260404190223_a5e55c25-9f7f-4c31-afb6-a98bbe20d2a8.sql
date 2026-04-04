
-- Drop and recreate without SECURITY DEFINER (default is INVOKER which is correct)
DROP VIEW IF EXISTS public.client_portal_users_safe;

CREATE VIEW public.client_portal_users_safe 
WITH (security_invoker = true)
AS
SELECT 
  id, customer_id, username, must_change_password, 
  is_active, last_login_at, created_at, updated_at, organization_id
FROM public.client_portal_users;

GRANT SELECT ON public.client_portal_users_safe TO authenticated;
