ALTER TABLE public.demo_bookings
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;

INSERT INTO public.platform_settings (key, value)
VALUES ('demo_default_meeting_link', jsonb_build_object('url', ''))
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "Platform admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Platform admins manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

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