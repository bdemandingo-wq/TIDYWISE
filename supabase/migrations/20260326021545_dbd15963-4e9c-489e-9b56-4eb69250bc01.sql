DROP POLICY IF EXISTS "Staff can view org signable documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff can view own signed PDFs" ON storage.objects;

CREATE POLICY "Staff can view org signable documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(objects.name))[1] = 'signable'
  AND EXISTS (
    SELECT 1
    FROM public.staff staff_member
    WHERE staff_member.user_id = auth.uid()
      AND staff_member.organization_id::text = (storage.foldername(objects.name))[2]
      AND staff_member.is_active = true
  )
);

CREATE POLICY "Staff can view own signed PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'staff-documents'
  AND (storage.foldername(objects.name))[1] = 'signed'
  AND EXISTS (
    SELECT 1
    FROM public.staff staff_member
    WHERE staff_member.user_id = auth.uid()
      AND staff_member.organization_id::text = (storage.foldername(objects.name))[2]
      AND staff_member.id::text = (storage.foldername(objects.name))[3]
      AND staff_member.is_active = true
  )
);