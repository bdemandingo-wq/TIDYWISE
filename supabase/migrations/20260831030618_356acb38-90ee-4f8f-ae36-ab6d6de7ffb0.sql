CREATE OR REPLACE FUNCTION public.current_user_may_create_organization()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_invites oi
      JOIN auth.users u ON lower(u.email) = lower(oi.email)
      WHERE u.id = auth.uid()
        AND (
          oi.accepted_by = auth.uid()
          OR (oi.accepted_at IS NULL AND oi.expires_at > now())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_may_create_organization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_may_create_organization() TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
CREATE POLICY "Standalone users can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND public.current_user_may_create_organization()
);