-- SECURITY: Remove the dangerously open SELECT policy that allows ANY anonymous
-- user to read ALL bookings across ALL organizations.
-- 
-- The public booking widget does NOT need to SELECT bookings — it only INSERTs,
-- and the booking confirmation is shown from the INSERT response data.
-- Authenticated admin/staff/customer policies already cover all legitimate reads.
DROP POLICY IF EXISTS "Anyone can view own booking" ON public.bookings;

-- Also tighten the customer INSERT policy — require organization_id to be set
-- so random bots can't inject cross-org records.
-- (INSERT still allowed for public booking form, just must include org_id)
DROP POLICY IF EXISTS "Anyone can create customer" ON public.customers;
CREATE POLICY "Anyone can create customer"
ON public.customers
FOR INSERT
TO public
WITH CHECK (organization_id IS NOT NULL);

-- Tighten bookings INSERT to require organization_id
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
CREATE POLICY "Anyone can create bookings"
ON public.bookings
FOR INSERT
TO public
WITH CHECK (organization_id IS NOT NULL);
