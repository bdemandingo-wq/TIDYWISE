-- Fix the SELECT policy to allow users to see orgs they own OR are members of
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;

CREATE POLICY "Users can view their organizations"
ON public.organizations FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid() OR is_org_member(id)
);