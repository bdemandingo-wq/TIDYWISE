-- Prevent privilege escalation via the INSERT path on org_memberships.
-- The existing "Users can create first membership" policy allowed anyone
-- passing is_org_admin() (which includes 'manager') to insert their own
-- membership row with role = 'owner', escalating their privileges.
-- The UPDATE policy already blocks this; we mirror the same rule here.

DROP POLICY IF EXISTS "Users can create first membership" ON public.org_memberships;

CREATE POLICY "Users can create first membership"
ON public.org_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    -- Bootstrap the first membership for a brand-new org (no rows yet).
    NOT EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.organization_id = org_memberships.organization_id
    )
    OR (
      -- Otherwise the caller must already be an org admin, AND may only
      -- grant themselves 'owner' if they are already an owner of that org.
      public.is_org_admin(org_memberships.organization_id)
      AND (
        role <> 'owner'
        OR public.is_org_owner(org_memberships.organization_id)
      )
    )
  )
);