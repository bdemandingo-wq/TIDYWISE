
-- Add missing WITH CHECK clauses on UPDATE policies
DROP POLICY IF EXISTS "Users can update invoice items in their org" ON public.invoice_items;
CREATE POLICY "Users can update invoice items in their org" ON public.invoice_items
  FOR UPDATE USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update their org tasks" ON public.tasks_and_notes;
CREATE POLICY "Users can update their org tasks" ON public.tasks_and_notes
  FOR UPDATE USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update team messages in their org" ON public.team_messages;
CREATE POLICY "Users can update team messages in their org" ON public.team_messages
  FOR UPDATE USING (is_org_member(organization_id)) WITH CHECK (is_org_member(organization_id));

-- Prevent cross-tenant reassignment via trigger (defense-in-depth, since WITH CHECK
-- with is_org_member would still allow a user who belongs to multiple orgs to move rows).
CREATE OR REPLACE FUNCTION public.prevent_org_id_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'organization_id is immutable on %', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','sms_messages','tasks_and_notes','team_messages','invoice_items']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS lock_organization_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER lock_organization_id BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_org_id_change()', t);
  END LOOP;
END $$;
