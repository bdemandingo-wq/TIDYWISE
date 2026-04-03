
-- Fix booking-photos storage policies to use SECURITY DEFINER function instead of inline subquery
-- This prevents RLS-on-RLS evaluation issues

-- Drop existing policies
DROP POLICY IF EXISTS "Org members upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Org members view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Org members update booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Org admins delete booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff view booking photos" ON storage.objects;

-- Recreate using is_org_member / is_org_admin SECURITY DEFINER functions
CREATE POLICY "Org members upload booking photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'booking-photos' 
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Org members view booking photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'booking-photos' 
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Org members update booking photos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'booking-photos' 
  AND is_org_member((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Org admins delete booking photos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'booking-photos' 
  AND is_org_admin((storage.foldername(name))[1]::uuid)
);
