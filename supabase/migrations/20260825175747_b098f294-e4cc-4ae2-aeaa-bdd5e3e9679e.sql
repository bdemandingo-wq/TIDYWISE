CREATE OR REPLACE FUNCTION public.org_has_no_memberships(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.org_memberships
    WHERE organization_id = _org_id
  );
$function$;

REVOKE ALL ON FUNCTION public.org_has_no_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_has_no_memberships(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_has_no_memberships(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_no_memberships(uuid) TO service_role;

ALTER POLICY "Users can create first membership"
ON public.org_memberships
WITH CHECK (
  (user_id = (SELECT auth.uid()))
  AND (
    (
      role = 'owner'::text
      AND public.org_has_no_memberships(organization_id)
      AND EXISTS (
        SELECT 1
        FROM public.organizations o
        WHERE o.id = org_memberships.organization_id
          AND o.owner_id = (SELECT auth.uid())
      )
    )
    OR (
      public.is_org_admin(organization_id)
      AND (
        role <> 'owner'::text
        OR public.is_org_owner(organization_id)
      )
    )
  )
);