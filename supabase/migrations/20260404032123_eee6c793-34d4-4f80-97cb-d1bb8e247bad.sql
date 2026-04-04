
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Staff and admins can upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff and admins can view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff and admins can update booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete booking photos" ON storage.objects;

-- Create open policies for any authenticated user
CREATE POLICY "Authenticated users can upload booking photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'booking-photos');

CREATE POLICY "Authenticated users can view booking photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'booking-photos');

CREATE POLICY "Authenticated users can update booking photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'booking-photos');

CREATE POLICY "Authenticated users can delete booking photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'booking-photos');

-- Update bucket to allow video MIME types and increase size limit
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/x-m4v'],
    file_size_limit = 104857600
WHERE id = 'booking-photos';
