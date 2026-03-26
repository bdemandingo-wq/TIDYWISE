
-- Allow staff to upload signature images to the signatures/ folder
DROP POLICY IF EXISTS "Staff can upload signature images" ON storage.objects;
CREATE POLICY "Staff can upload signature images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] = 'signatures'
  AND EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id::text = (storage.foldername(name))[2]
      AND s.id::text = (storage.foldername(name))[3]
      AND s.is_active = true
  )
);

-- Allow staff to read their own signature images
DROP POLICY IF EXISTS "Staff can view signature images" ON storage.objects;
CREATE POLICY "Staff can view signature images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(name))[1] = 'signatures'
  AND EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.organization_id::text = (storage.foldername(name))[2]
      AND s.id::text = (storage.foldername(name))[3]
      AND s.is_active = true
  )
);
