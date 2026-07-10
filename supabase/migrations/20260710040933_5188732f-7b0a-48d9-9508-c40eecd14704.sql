
-- Migrate any existing 'admin' org memberships to 'manager'. 'admin' is
-- no longer a valid org role — only 'owner', 'manager', 'member'.
UPDATE public.org_memberships SET role = 'manager' WHERE role = 'admin';

-- Also update any pending invites created with role='admin'.
UPDATE public.organization_invites SET role = 'manager' WHERE role = 'admin';

-- Tighten role validation: only 'owner' or 'manager' can be assigned.
CREATE OR REPLACE FUNCTION public.update_org_member_role(_organization_id uuid, _target_user_id uuid, _new_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner_count int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _new_role NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF NOT public.is_org_owner(_organization_id) THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  IF _new_role <> 'owner' THEN
    SELECT count(*) INTO v_owner_count
    FROM public.org_memberships
    WHERE organization_id = _organization_id AND role = 'owner';
    IF v_owner_count <= 1 AND EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE organization_id = _organization_id
        AND user_id = _target_user_id
        AND role = 'owner'
    ) THEN
      RAISE EXCEPTION 'cannot_demote_last_owner';
    END IF;
  END IF;

  UPDATE public.org_memberships
     SET role = _new_role
   WHERE organization_id = _organization_id
     AND user_id = _target_user_id;
END $function$;

-- Financial access is owner-only now (admin no longer exists as a role).
CREATE OR REPLACE FUNCTION public.has_org_financial_access(_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$function$;
