-- Create storage bucket for staff avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-avatars', 'staff-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for staff avatars
CREATE POLICY "Staff can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'staff-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Staff can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'staff-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Staff can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'staff-avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view staff avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'staff-avatars');