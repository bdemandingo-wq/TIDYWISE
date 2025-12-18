-- Fix RLS policy for customers table - change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Anyone can create customer" ON public.customers;

CREATE POLICY "Anyone can create customer" 
ON public.customers 
FOR INSERT 
TO public
WITH CHECK (true);

-- Also fix the bookings policy to allow anyone to create bookings
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;

CREATE POLICY "Anyone can create bookings" 
ON public.bookings 
FOR INSERT 
TO public
WITH CHECK (true);