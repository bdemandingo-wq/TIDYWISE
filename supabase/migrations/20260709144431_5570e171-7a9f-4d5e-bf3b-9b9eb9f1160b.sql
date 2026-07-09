
-- ============================================================================
-- Team invites + role expansion + financial gating helpers
-- ============================================================================

-- 1) Allow 'admin' and 'manager' as membership roles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema='public' AND table_name='org_memberships'
      AND constraint_type='CHECK' AND constraint_name='org_memberships_role_check'
  ) THEN
    ALTER TABLE public.org_memberships DROP CONSTRAINT org_memberships_role_check;
  END IF;
END $$;

ALTER TABLE public.org_memberships
  ADD CONSTRAINT org_memberships_role_check
  CHECK (role IN ('owner','admin','manager','member'));

-- 2) Helper: owner-only (billing management)
CREATE OR REPLACE FUNCTION public.is_org_owner(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- 3) Helper: owner+admin only (see financials, not billing)
CREATE OR REPLACE FUNCTION public.has_org_financial_access(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin')
  );
$$;

-- 4) Helper: owner+admin+manager (full operations)
CREATE OR REPLACE FUNCTION public.is_org_operator(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin','manager')
  );
$$;

-- 5) Give managers operational access to core tables via additive policies.
--    We keep existing is_org_admin policies intact; managers get parallel access
--    to bookings, customers, tasks, messages, scheduling, and related.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'bookings','customers','tasks_and_notes','sms_conversations','sms_messages',
    'booking_photos','booking_checklists','booking_checklist_items',
    'booking_team_assignments','property_notes','recurring_bookings',
    'client_booking_requests','review_requests','leads','estimates','quotes',
    'time_off_requests'
  ]) LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "Managers full ops access" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "Managers full ops access" ON public.%I FOR ALL TO authenticated ' ||
        'USING (public.is_org_operator(organization_id)) ' ||
        'WITH CHECK (public.is_org_operator(organization_id))',
        t
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
    END;
  END LOOP;
END $$;

-- 6) Block managers on financial tables (only owner+admin permitted).
--    Drop broad is_org_admin ALL policies and replace with financial-only.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'invoices','invoice_items','payroll_payments','payroll_settings',
    'payroll_audit_log','stripe_subscriptions','org_stripe_settings',
    'manual_payments','expenses','tips','disputes'
  ]) LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS "Financial: owner+admin only" ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY "Financial: owner+admin only" ON public.%I FOR ALL TO authenticated ' ||
        'USING (public.has_org_financial_access(organization_id)) ' ||
        'WITH CHECK (public.has_org_financial_access(organization_id))',
        t
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
    END;
  END LOOP;
END $$;

-- 7) organization_invites table
CREATE TABLE IF NOT EXISTS public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','manager')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_invites_org ON public.organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON public.organization_invites(lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage invites" ON public.organization_invites;
CREATE POLICY "Owners manage invites"
  ON public.organization_invites FOR ALL TO authenticated
  USING (public.is_org_owner(organization_id))
  WITH CHECK (public.is_org_owner(organization_id));

DROP POLICY IF EXISTS "Admins view invites" ON public.organization_invites;
CREATE POLICY "Admins view invites"
  ON public.organization_invites FOR SELECT TO authenticated
  USING (public.has_org_financial_access(organization_id));

-- 8) RPC: change a member's role (owners only)
CREATE OR REPLACE FUNCTION public.update_org_member_role(
  _organization_id uuid,
  _target_user_id uuid,
  _new_role text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner_count int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _new_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF NOT public.is_org_owner(_organization_id) THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  -- Prevent demoting the last owner
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
END $$;

GRANT EXECUTE ON FUNCTION public.update_org_member_role(uuid, uuid, text) TO authenticated;

-- 9) RPC: remove member (owners only, cannot remove last owner)
CREATE OR REPLACE FUNCTION public.remove_org_member(
  _organization_id uuid,
  _target_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.is_org_owner(_organization_id) THEN
    RAISE EXCEPTION 'insufficient_permission';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _organization_id
      AND user_id = _target_user_id AND role = 'owner'
  ) THEN
    SELECT count(*) INTO v_owner_count FROM public.org_memberships
    WHERE organization_id = _organization_id AND role = 'owner';
    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'cannot_remove_last_owner';
    END IF;
  END IF;

  DELETE FROM public.org_memberships
   WHERE organization_id = _organization_id
     AND user_id = _target_user_id;
END $$;

GRANT EXECUTE ON FUNCTION public.remove_org_member(uuid, uuid) TO authenticated;

-- 10) RPC: list org members with resolved email/name (owners+admins)
CREATE OR REPLACE FUNCTION public.list_org_members(_organization_id uuid)
RETURNS TABLE(user_id uuid, email text, full_name text, role text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT m.user_id,
         u.email::text,
         COALESCE(p.full_name, u.email)::text,
         m.role,
         m.created_at
  FROM public.org_memberships m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.organization_id = _organization_id
    AND public.has_org_financial_access(_organization_id);
$$;
GRANT EXECUTE ON FUNCTION public.list_org_members(uuid) TO authenticated;

-- 11) Realtime: full replica identity so filtered UPDATE/DELETE payloads
--     include organization_id (fixes tracking-page subscription filter).
ALTER TABLE public.cleaner_location_tracking REPLICA IDENTITY FULL;
