-- Revoke direct SELECT on sensitive Stripe credential columns from frontend-facing roles.
-- This ensures the live secret keys can only be accessed by edge functions using the service role.
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token) ON public.org_stripe_settings FROM authenticated, anon;

-- Create a SECURITY DEFINER RPC that exposes only non-sensitive Stripe settings.
-- It explicitly verifies the caller is an admin or owner of the target organization.
CREATE OR REPLACE FUNCTION public.get_org_stripe_settings_safe(p_organization_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  stripe_publishable_key text,
  stripe_account_id text,
  is_connected boolean,
  connected_at timestamp with time zone,
  stripe_user_email text,
  stripe_display_name text,
  stripe_payouts_enabled boolean,
  stripe_default_currency text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.organization_id,
    s.stripe_publishable_key,
    s.stripe_account_id,
    s.is_connected,
    s.connected_at,
    s.stripe_user_email,
    s.stripe_display_name,
    s.stripe_payouts_enabled,
    s.stripe_default_currency,
    s.created_at,
    s.updated_at
  FROM public.org_stripe_settings s
  WHERE s.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1
      FROM public.org_memberships om
      WHERE om.organization_id = p_organization_id
        AND om.user_id = auth.uid()
        AND om.role = ANY(ARRAY['admin'::text, 'owner'::text])
    );
$$;

-- Allow authenticated users to call the safe lookup function.
GRANT EXECUTE ON FUNCTION public.get_org_stripe_settings_safe(uuid) TO authenticated;
