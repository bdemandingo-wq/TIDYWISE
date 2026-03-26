DROP POLICY IF EXISTS "Staff can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete their own documents" ON storage.objects;

CREATE POLICY "Staff can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'staff-documents'
  AND (storage.foldername(objects.name))[1] = 'documents'
  AND EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id::text = (storage.foldername(objects.name))[2]
      AND s.id::text = (storage.foldername(objects.name))[3]
      AND s.is_active = true
  )
);

CREATE POLICY "Staff can view their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (
    (
      (storage.foldername(objects.name))[1] = 'documents'
      AND EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.organization_id::text = (storage.foldername(objects.name))[2]
          AND s.id::text = (storage.foldername(objects.name))[3]
          AND s.is_active = true
      )
    )
    OR (storage.foldername(objects.name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Staff can delete their own documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (
    (
      (storage.foldername(objects.name))[1] = 'documents'
      AND EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.user_id = auth.uid()
          AND s.organization_id::text = (storage.foldername(objects.name))[2]
          AND s.id::text = (storage.foldername(objects.name))[3]
          AND s.is_active = true
      )
    )
    OR (storage.foldername(objects.name))[1] = auth.uid()::text
  )
);