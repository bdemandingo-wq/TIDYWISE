CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = 'e95b92d0-7099-408e-a773-e4407b34f8b4'::uuid
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Platform admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Platform admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "Platform admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Platform admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_org_stripe_public_settings(p_org_id uuid)
RETURNS TABLE (
  organization_id uuid,
  is_connected boolean,
  stripe_account_id text,
  stripe_publishable_key text,
  stripe_user_email text,
  stripe_display_name text,
  stripe_payouts_enabled boolean,
  stripe_default_currency text,
  connected_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    oss.organization_id,
    oss.is_connected,
    oss.stripe_account_id,
    oss.stripe_publishable_key,
    oss.stripe_user_email,
    oss.stripe_display_name,
    oss.stripe_payouts_enabled,
    oss.stripe_default_currency,
    oss.connected_at
  FROM public.org_stripe_settings oss
  WHERE oss.organization_id = p_org_id
    AND public.is_org_admin(p_org_id)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_stripe_public_settings(uuid) TO authenticated;