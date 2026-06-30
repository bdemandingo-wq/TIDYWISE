-- 1) Allow 'inspection' as a valid photo_type so the Property Inspection Report can submit
ALTER TABLE public.booking_photos DROP CONSTRAINT IF EXISTS booking_photos_photo_type_check;
ALTER TABLE public.booking_photos ADD CONSTRAINT booking_photos_photo_type_check
  CHECK (photo_type = ANY (ARRAY['before'::text, 'after'::text, 'other'::text, 'inspection'::text]));

-- 2) Allow org staff to create admin notifications (so completed jobs + inspection reports show up in the admin bell)
DROP POLICY IF EXISTS "Staff insert org system notifications" ON public.admin_system_notifications;
CREATE POLICY "Staff insert org system notifications"
  ON public.admin_system_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (is_org_staff(organization_id) OR is_org_admin(organization_id));
