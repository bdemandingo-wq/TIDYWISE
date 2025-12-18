-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone can create customer" ON public.customers;

CREATE POLICY "Anyone can create customer"
ON public.customers
FOR INSERT
TO public
WITH CHECK (true);