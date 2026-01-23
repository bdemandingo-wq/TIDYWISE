-- Harden RLS policies to authenticated users only for org mobile nav settings
DROP POLICY IF EXISTS "Org members can view mobile nav settings" ON public.organization_mobile_nav_settings;
DROP POLICY IF EXISTS "Org admins can insert mobile nav settings" ON public.organization_mobile_nav_settings;
DROP POLICY IF EXISTS "Org admins can update mobile nav settings" ON public.organization_mobile_nav_settings;
DROP POLICY IF EXISTS "Org admins can delete mobile nav settings" ON public.organization_mobile_nav_settings;

CREATE POLICY "Org members can view mobile nav settings"
ON public.organization_mobile_nav_settings
FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "Org admins can insert mobile nav settings"
ON public.organization_mobile_nav_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update mobile nav settings"
ON public.organization_mobile_nav_settings
FOR UPDATE
TO authenticated
USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete mobile nav settings"
ON public.organization_mobile_nav_settings
FOR DELETE
TO authenticated
USING (public.is_org_admin(organization_id));