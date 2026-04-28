-- C4: Lock down demo_reminder_log
ALTER TABLE public.demo_reminder_log ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing permissive policies just in case
DROP POLICY IF EXISTS "Public can view demo reminder log" ON public.demo_reminder_log;
DROP POLICY IF EXISTS "Anyone can read demo reminder log" ON public.demo_reminder_log;

-- No SELECT/INSERT/UPDATE/DELETE policies for authenticated/anon users.
-- Service role bypasses RLS, so internal cron/edge functions still work.

-- H1: Block admin → owner self-escalation in org_memberships
DROP POLICY IF EXISTS "Org admins can update memberships" ON public.org_memberships;

CREATE POLICY "Org admins can update memberships"
ON public.org_memberships
FOR UPDATE
TO authenticated
USING (public.is_org_admin(organization_id))
WITH CHECK (
  public.is_org_admin(organization_id)
  AND (
    -- Allow any non-owner role change
    role <> 'owner'
    -- Owner role can only be granted by an existing owner of this org
    OR EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.organization_id = org_memberships.organization_id
        AND m.user_id = auth.uid()
        AND m.role = 'owner'
    )
  )
);