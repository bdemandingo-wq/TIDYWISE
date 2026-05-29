DROP POLICY IF EXISTS "Anyone can view staff services" ON public.staff_services;

CREATE POLICY "Org members can view staff services"
ON public.staff_services
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.org_memberships om ON om.organization_id = s.organization_id
    WHERE s.id = staff_services.staff_id
      AND om.user_id = auth.uid()
  )
);