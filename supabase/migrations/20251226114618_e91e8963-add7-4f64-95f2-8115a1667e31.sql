-- Drop and recreate the organizations INSERT policy with correct syntax
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

-- Also fix the org_memberships INSERT policy to allow first membership creation
DROP POLICY IF EXISTS "Org admins can manage memberships" ON public.org_memberships;

CREATE POLICY "Users can create first membership"
ON public.org_memberships FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND (
    -- User is creating membership for an org they own
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
    OR
    -- Or an admin is adding them
    public.is_org_admin(organization_id)
  )
);