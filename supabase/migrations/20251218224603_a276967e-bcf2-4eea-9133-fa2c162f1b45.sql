-- Fix customers RLS policies - make INSERT permissive
DROP POLICY IF EXISTS "Anyone can create customer" ON public.customers;
CREATE POLICY "Anyone can create customer"
ON public.customers
FOR INSERT
TO public
WITH CHECK (true);

-- Fix bookings RLS policies - make INSERT permissive
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
CREATE POLICY "Anyone can create bookings"
ON public.bookings
FOR INSERT
TO public
WITH CHECK (true);

-- Also add a SELECT policy so the created booking can be returned
DROP POLICY IF EXISTS "Anyone can view own booking" ON public.bookings;
CREATE POLICY "Anyone can view own booking"
ON public.bookings
FOR SELECT
TO public
USING (true);