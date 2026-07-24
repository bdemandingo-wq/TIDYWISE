-- Editable weekly demo availability, seeded with the values previously
-- hardcoded in DemoBookingForm / DemoCalendarTab so day-one behavior is
-- identical. Admin edits via the existing platform-admin write policy;
-- the public booking form reads it through the SECURITY DEFINER function
-- below (same pattern as get_demo_booked_slots), so anon never touches
-- the platform_settings table directly.

INSERT INTO public.platform_settings (key, value)
VALUES ('demo_availability', '{
  "0": {"start": 13, "end": 22},
  "1": {"start": 19, "end": 22},
  "2": null,
  "3": {"start": 19, "end": 22},
  "4": null,
  "5": null,
  "6": {"start": 10, "end": 22}
}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_demo_availability()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.platform_settings WHERE key = 'demo_availability'
$$;

REVOKE ALL ON FUNCTION public.get_demo_availability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_availability() TO anon, authenticated, service_role;