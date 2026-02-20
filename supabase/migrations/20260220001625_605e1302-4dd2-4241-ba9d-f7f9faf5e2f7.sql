
-- Create table for configurable appointment reminder intervals
CREATE TABLE public.appointment_reminder_intervals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  hours_before NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  send_to_client BOOLEAN NOT NULL DEFAULT true,
  send_to_cleaner BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, hours_before)
);

-- Enable RLS
ALTER TABLE public.appointment_reminder_intervals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org members can view reminder intervals"
  ON public.appointment_reminder_intervals FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org admins can insert reminder intervals"
  ON public.appointment_reminder_intervals FOR INSERT
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update reminder intervals"
  ON public.appointment_reminder_intervals FOR UPDATE
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete reminder intervals"
  ON public.appointment_reminder_intervals FOR DELETE
  USING (public.is_org_admin(organization_id));

-- Auto-provision default intervals for new organizations
CREATE OR REPLACE FUNCTION public.provision_default_reminder_intervals()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $func$
BEGIN
  INSERT INTO public.appointment_reminder_intervals (organization_id, label, hours_before, is_active, send_to_client, send_to_cleaner)
  VALUES
    (NEW.id, '5 Days Before', 120, true, true, false),
    (NEW.id, '24 Hours Before', 24, true, true, true),
    (NEW.id, '1 Hour Before', 1, true, true, false)
  ON CONFLICT (organization_id, hours_before) DO NOTHING;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER provision_reminder_intervals_on_org_create
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_default_reminder_intervals();

-- Seed defaults for all existing organizations that don't have them yet
INSERT INTO public.appointment_reminder_intervals (organization_id, label, hours_before, is_active, send_to_client, send_to_cleaner)
SELECT o.id, '5 Days Before', 120, true, true, false
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.appointment_reminder_intervals ari
  WHERE ari.organization_id = o.id AND ari.hours_before = 120
)
UNION ALL
SELECT o.id, '24 Hours Before', 24, true, true, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.appointment_reminder_intervals ari
  WHERE ari.organization_id = o.id AND ari.hours_before = 24
)
UNION ALL
SELECT o.id, '1 Hour Before', 1, true, true, false
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.appointment_reminder_intervals ari
  WHERE ari.organization_id = o.id AND ari.hours_before = 1
);
