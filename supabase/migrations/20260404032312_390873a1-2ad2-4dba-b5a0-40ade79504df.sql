
-- Drop all existing policies
DROP POLICY IF EXISTS "Org admins can manage booking photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Staff can insert booking photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Staff can view org booking photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Users can create booking photos in their org" ON public.booking_photos;
DROP POLICY IF EXISTS "Users can delete booking photos in their org" ON public.booking_photos;
DROP POLICY IF EXISTS "Users can update booking photos in their org" ON public.booking_photos;
DROP POLICY IF EXISTS "Users can view booking photos in their org" ON public.booking_photos;

-- Simple open policies for authenticated users
CREATE POLICY "Authenticated can insert booking photos"
ON public.booking_photos FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can view booking photos"
ON public.booking_photos FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can update booking photos"
ON public.booking_photos FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated can delete booking photos"
ON public.booking_photos FOR DELETE TO authenticated
USING (true);
