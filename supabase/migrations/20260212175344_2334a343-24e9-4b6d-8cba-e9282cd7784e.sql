
-- Drop all existing booking-photos policies
DROP POLICY IF EXISTS "Authenticated users can upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete booking photos" ON storage.objects;

-- Organization-scoped INSERT: path must start with user's org_id
CREATE POLICY "Org members upload booking photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'booking-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Organization-scoped SELECT: only see photos from your org
CREATE POLICY "Org members view booking photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Organization-scoped UPDATE
CREATE POLICY "Org members update booking photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Organization-scoped DELETE (admins only)
CREATE POLICY "Org admins delete booking photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.org_memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);
