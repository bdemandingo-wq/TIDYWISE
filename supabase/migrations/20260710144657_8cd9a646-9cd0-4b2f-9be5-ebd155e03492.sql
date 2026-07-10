-- ── 1) DELETE policy ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins can remove memberships" ON public.org_memberships;

CREATE POLICY "Org admins can remove memberships"
ON public.org_memberships
FOR DELETE
TO authenticated
USING (
  CASE
    WHEN role = 'owner' THEN public.is_org_owner(organization_id)
    ELSE public.is_org_admin(organization_id) OR user_id = auth.uid()
  END
);

-- ── 2) UPDATE policy ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins can update memberships" ON public.org_memberships;

CREATE POLICY "Org admins can update memberships"
ON public.org_memberships
FOR UPDATE
TO authenticated
USING (
  public.is_org_admin(organization_id)
  AND (role <> 'owner' OR public.is_org_owner(organization_id))
)
WITH CHECK (
  public.is_org_admin(organization_id)
  AND (
    role <> 'owner'
    OR public.is_org_owner(organization_id)
  )
);

-- ── 3) Last-Owner guard trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_count int;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner') THEN
    SELECT count(*) INTO v_owner_count
    FROM public.org_memberships
    WHERE organization_id = OLD.organization_id
      AND role = 'owner';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_owner_removal ON public.org_memberships;
CREATE TRIGGER trg_prevent_last_owner_removal
  BEFORE DELETE OR UPDATE ON public.org_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_owner_removal();

-- ── 4) Audit logging ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_org_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_action_audit_log (organization_id, admin_user_id, action, details)
    VALUES (
      OLD.organization_id,
      auth.uid(),
      'org_membership_removed',
      jsonb_build_object('target_user_id', OLD.user_id, 'removed_role', OLD.role)
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.admin_action_audit_log (organization_id, admin_user_id, action, details)
    VALUES (
      NEW.organization_id,
      auth.uid(),
      'org_membership_role_changed',
      jsonb_build_object('target_user_id', NEW.user_id, 'old_role', OLD.role, 'new_role', NEW.role)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_org_membership_change ON public.org_memberships;
CREATE TRIGGER trg_audit_org_membership_change
  AFTER DELETE OR UPDATE ON public.org_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_org_membership_change();