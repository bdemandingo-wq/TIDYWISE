
-- Create storage bucket for business assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their org folder
CREATE POLICY "Org members can upload business assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'business-assets');

CREATE POLICY "Public read access to business assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'business-assets');

CREATE POLICY "Org members can update business assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'business-assets');
