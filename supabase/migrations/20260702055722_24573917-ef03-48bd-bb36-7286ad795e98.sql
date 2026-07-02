-- booking_checklist_items
DROP POLICY IF EXISTS "Admins can manage booking checklist items" ON public.booking_checklist_items;
DROP POLICY IF EXISTS "Org admins can manage booking checklist items" ON public.booking_checklist_items;
CREATE POLICY "Org admins can manage booking checklist items"
  ON public.booking_checklist_items
  FOR ALL
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- staff_services
DROP POLICY IF EXISTS "Admins can manage staff services" ON public.staff_services;
DROP POLICY IF EXISTS "Org admins can manage staff services" ON public.staff_services;
CREATE POLICY "Org admins can manage staff services"
  ON public.staff_services
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_services.staff_id
      AND public.is_org_admin(s.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_services.staff_id
      AND public.is_org_admin(s.organization_id)
  ));

-- working_hours
DROP POLICY IF EXISTS "Admins can manage working hours" ON public.working_hours;
DROP POLICY IF EXISTS "Org admins can manage working hours" ON public.working_hours;
CREATE POLICY "Org admins can manage working hours"
  ON public.working_hours
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = working_hours.staff_id
      AND public.is_org_admin(s.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = working_hours.staff_id
      AND public.is_org_admin(s.organization_id)
  ));