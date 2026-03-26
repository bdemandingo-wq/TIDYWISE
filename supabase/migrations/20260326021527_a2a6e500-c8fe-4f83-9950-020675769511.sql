CREATE POLICY "Staff can view org signable documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] = 'signable'
  AND EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id::text = (storage.foldername(name))[2]
      AND s.is_active = true
  )
);

CREATE POLICY "Staff can view own signed PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] = 'signed'
  AND EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id::text = (storage.foldername(name))[2]
      AND s.id::text = (storage.foldername(name))[3]
      AND s.is_active = true
  )
);