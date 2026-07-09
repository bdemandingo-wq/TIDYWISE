-- Ensure org owners & admins can delete customers (explicit, permissive policy)
DROP POLICY IF EXISTS "Org owners and admins can delete customers" ON public.customers;
CREATE POLICY "Org owners and admins can delete customers"
ON public.customers
FOR DELETE
TO authenticated
USING (
  public.is_org_admin(organization_id)
  OR EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = customers.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

-- Enable realtime for staff_documents and booking_photos
ALTER TABLE public.staff_documents REPLICA IDENTITY FULL;
ALTER TABLE public.booking_photos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_documents'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_documents';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'booking_photos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_photos';
  END IF;
END $$;