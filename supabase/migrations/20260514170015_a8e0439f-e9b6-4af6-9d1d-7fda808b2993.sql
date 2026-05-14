
DO $$ BEGIN
  CREATE POLICY "Org admins delete ignored pairs"
    ON public.customer_duplicate_ignored FOR DELETE
    USING (public.is_org_admin(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
