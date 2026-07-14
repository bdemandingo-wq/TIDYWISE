DROP POLICY IF EXISTS "Users can create first membership" ON public.org_memberships;

CREATE POLICY "Users can create first membership"
ON public.org_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    -- Bootstrap: only the organization's registered owner may claim the
    -- first membership, and only as 'owner'. This prevents any authenticated
    -- user from taking over an org that happens to have zero memberships
    -- (signup race, all members removed, etc.).
    (
      role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = org_memberships.organization_id
      )
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = org_memberships.organization_id
          AND o.owner_id = auth.uid()
      )
    )
    OR (
      -- Otherwise the caller must already be an org admin, AND may only
      -- grant 'owner' if they are already an owner of that org.
      public.is_org_admin(org_memberships.organization_id)
      AND (
        role <> 'owner'
        OR public.is_org_owner(org_memberships.organization_id)
      )
    )
  )
);