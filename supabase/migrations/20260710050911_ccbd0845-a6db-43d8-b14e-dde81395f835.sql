
-- Broaden is_org_admin so it recognizes the 'manager' role (invited team members).
-- Without this, every RLS policy that checks is_org_admin() returns false for
-- managers and their workspace appears empty (no staff, no customers, no bookings).

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = _user_id
      AND role IN ('owner','admin','manager')
  );
$function$;
