-- Database-layer protection for org Owner memberships.
--
-- Gap being closed: the DELETE policy on org_memberships
-- ("Org admins can remove memberships") allowed ANY org admin — which
-- includes the 'manager' role, per is_org_admin() — to delete another
-- member's row, with no check on the row's own role. That means a
-- manager could delete an Owner's membership outright. Separately, the
-- UPDATE policy's WITH CHECK only inspected the proposed NEW role (to
-- stop granting 'owner' without already being one) but never inspected
-- the row's CURRENT role, so a manager could demote an existing Owner
-- to 'admin' via UPDATE. Neither policy protected against removing/
-- demoting the org's LAST remaining Owner — that guard only existed in
-- the remove_org_member/update_org_member_role RPCs, which are the
-- app's primary path but not the only possible one.
--
-- This migration:
--   1) Tightens the DELETE policy so only an existing Owner of the org
--      may delete an Owner's membership row (their own or another's).
--      Non-owner rows keep existing behavior (org admins/managers can
--      remove members; anyone can remove their own non-owner row).
--   2) Tightens the UPDATE policy's USING clause so only an existing
--      Owner may touch (promote OR demote) a row that is currently
--      role = 'owner'. The existing WITH CHECK (owner-only to grant
--      'owner') is preserved as-is.
--   3) Adds a BEFORE DELETE/UPDATE trigger that blocks removing or
--      demoting the org's last remaining Owner, at the table level —
--      independent of which path (RLS-checked client call or the
--      SECURITY DEFINER RPCs) reached the row. It steps aside for
--      service_role, which is how delete-my-account/delete-my-organization
--      intentionally tear down every membership row for a closing
--      account/org (those functions already verify owner status before
--      they start).
--   4) Adds an AFTER DELETE/UPDATE trigger that writes an audit row to
--      the existing admin_action_audit_log table for every membership
--      removal or role change.

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
  -- Only an Owner may touch a row that is currently an Owner's — this
  -- is what stops a manager/admin from demoting an existing Owner.
  AND (role <> 'owner' OR public.is_org_owner(organization_id))
)
WITH CHECK (
  public.is_org_admin(organization_id)
  -- Only an Owner may grant the 'owner' role (promotion).
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
  -- delete-my-account and delete-my-organization run as service_role and
  -- explicitly tear down every org_memberships row for a closing
  -- account/org (after already verifying the caller owns it). Let those
  -- through untouched — this guard exists to stop a *live* org from
  -- being left ownerless, not to block someone deleting their own
  -- account or organization outright.
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

    -- BEFORE trigger: OLD's own row is still counted here, so
    -- count <= 1 means OLD is the last Owner row for this org.
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
