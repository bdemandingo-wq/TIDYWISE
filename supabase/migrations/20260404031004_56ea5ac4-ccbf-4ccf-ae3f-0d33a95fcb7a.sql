
-- Create a SECURITY DEFINER function to check if the current user is a staff member of an org
-- This avoids RLS recursion issues in storage policies
CREATE OR REPLACE FUNCTION public.is_org_staff(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.staff 
    WHERE organization_id = _org_id 
      AND user_id = auth.uid()
      AND is_active = true
  )
$$;

-- Drop existing storage policies for booking-photos that only check org_memberships
DROP POLICY IF EXISTS "Org members upload booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Org members view booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Org members update booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Org admins delete booking photos" ON storage.objects;

-- Recreate policies that allow BOTH org members AND staff to access booking photos
CREATE POLICY "Staff and admins can upload booking photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'booking-photos'
  AND (
    is_org_member((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Staff and admins can view booking photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (
    is_org_member((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Staff and admins can update booking photos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND (
    is_org_member((storage.foldername(name))[1]::uuid)
    OR is_org_staff((storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Admins can delete booking photos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'booking-photos'
  AND is_org_admin((storage.foldername(name))[1]::uuid)
);

-- Also update the booking_photos TABLE policy for staff insert
-- The existing "Staff can insert own booking photos" only checks b.staff_id
-- but team assignments may also be relevant. Let's add a broader staff policy.
DROP POLICY IF EXISTS "Staff can insert own booking photos" ON public.booking_photos;

CREATE POLICY "Staff can insert booking photos" ON public.booking_photos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = booking_photos.organization_id
  )
);

-- Also let staff view photos for their org's bookings
DROP POLICY IF EXISTS "Staff can view own booking photos" ON public.booking_photos;

CREATE POLICY "Staff can view org booking photos" ON public.booking_photos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND s.organization_id = booking_photos.organization_id
  )
);
