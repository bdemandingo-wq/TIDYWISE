
CREATE POLICY "Admins update org documents"
  ON public.staff_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = staff_documents.organization_id
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = staff_documents.organization_id
        AND om.role IN ('owner', 'admin')
    )
  );
