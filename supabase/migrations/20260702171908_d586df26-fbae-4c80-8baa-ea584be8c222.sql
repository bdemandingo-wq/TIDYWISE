
-- Restrict platform_settings reads to platform admins only
DROP POLICY IF EXISTS "Authenticated can read platform settings" ON public.platform_settings;
CREATE POLICY "Platform admins can read platform settings"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Restrict help_videos reads: global videos (organization_id IS NULL) OR user's own org
DROP POLICY IF EXISTS "Authenticated users can view all help videos" ON public.help_videos;
CREATE POLICY "Members can view their org help videos or global ones"
  ON public.help_videos FOR SELECT
  TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id, auth.uid()));

-- Remove redundant staff self-update policy; keep the combined one which is
-- backed by the guard_staff_wage_updates trigger that blocks pay/tax changes.
DROP POLICY IF EXISTS "Staff can update own record" ON public.staff;
