-- Add storage INSERT policy for staff who may not have org_memberships
-- This allows authenticated staff to upload to their org's booking-photos folder
CREATE POLICY "Staff upload booking photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'booking-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT s.organization_id::text
    FROM staff s
    WHERE s.user_id = auth.uid()
  )
);

-- Add storage SELECT policy for staff
CREATE POLICY "Staff view booking photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'booking-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT s.organization_id::text
    FROM staff s
    WHERE s.user_id = auth.uid()
  )
);

-- Also backfill org_memberships for any staff with user_id but missing membership
INSERT INTO org_memberships (user_id, organization_id, role)
SELECT s.user_id, s.organization_id, 'member'
FROM staff s
WHERE s.user_id IS NOT NULL
  AND s.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM org_memberships om
    WHERE om.user_id = s.user_id AND om.organization_id = s.organization_id
  );