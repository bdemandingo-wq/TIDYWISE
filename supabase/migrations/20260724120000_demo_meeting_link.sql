-- Demo meeting links: per-booking column + platform-wide default + auto-fill.

-- 1. Per-demo column (nullable; trigger below fills it from the default).
ALTER TABLE public.demo_bookings
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;

-- 2. Seed the platform default (empty until the permanent Meet room is set).
INSERT INTO public.platform_settings (key, value)
VALUES ('demo_default_meeting_link', jsonb_build_object('url', ''))
ON CONFLICT (key) DO NOTHING;

-- 3. Let platform admins write platform_settings from the admin UI.
--    (Reads are already admin-only; writes were service-role only.)
DROP POLICY IF EXISTS "Platform admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Platform admins manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- 4. Auto-fill meeting_link from the default on insert, when not set.
--    SECURITY DEFINER so the anonymous public booking form (which cannot
--    read platform_settings) still gets the link populated server-side.
--    Only fills when blank, so an explicit per-demo override is preserved.
CREATE OR REPLACE FUNCTION public.fill_demo_meeting_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.meeting_link IS NULL OR NEW.meeting_link = '' THEN
    SELECT NULLIF(value->>'url', '') INTO NEW.meeting_link
    FROM public.platform_settings
    WHERE key = 'demo_default_meeting_link';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_demo_meeting_link ON public.demo_bookings;
CREATE TRIGGER trg_fill_demo_meeting_link
  BEFORE INSERT ON public.demo_bookings
  FOR EACH ROW EXECUTE FUNCTION public.fill_demo_meeting_link();
