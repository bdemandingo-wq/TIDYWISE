-- Fix infinite recursion in RLS between customers <-> bookings
-- Root cause: customers policy references bookings, while bookings policies reference customers.
-- Solution: move the cross-table check into a SECURITY DEFINER function that bypasses RLS.

CREATE OR REPLACE FUNCTION public.staff_can_view_customer(_customer_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.bookings b
      ON b.organization_id = _org_id
     AND b.customer_id = _customer_id
    WHERE s.user_id = auth.uid()
      AND s.is_active = true
      AND (
        b.staff_id = s.id
        OR EXISTS (
          SELECT 1
          FROM public.booking_team_assignments bta
          WHERE bta.booking_id = b.id
            AND bta.staff_id = s.id
        )
      )
  );
$$;

-- Replace the problematic policy that caused recursion
DROP POLICY IF EXISTS "Staff can view customers for their bookings" ON public.customers;

CREATE POLICY "Staff can view customers for their bookings"
ON public.customers
FOR SELECT
USING (public.staff_can_view_customer(id, organization_id));
