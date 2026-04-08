
DROP POLICY IF EXISTS "Staff can upload signature images" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload signatures" ON storage.objects;

CREATE POLICY "Staff can upload signature images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] = 'signatures'
  AND EXISTS (
    SELECT 1 FROM staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id::text = (storage.foldername(objects.name))[2]
      AND s.id::text = (storage.foldername(objects.name))[3]
      AND s.is_active = true
  )
);
