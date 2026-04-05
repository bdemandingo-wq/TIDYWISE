
-- Create org feature flags table
CREATE TABLE public.org_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  openphone_calls_enabled BOOLEAN DEFAULT false,
  ai_assistant_enabled BOOLEAN DEFAULT false,
  daily_reports_enabled BOOLEAN DEFAULT false,
  integration_hub_enabled BOOLEAN DEFAULT true,
  demo_requests_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.org_feature_flags ENABLE ROW LEVEL SECURITY;

-- Org admins can read their own flags
CREATE POLICY "Org admins can read feature flags"
  ON public.org_feature_flags FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- Org admins can update their own flags
CREATE POLICY "Org admins can update feature flags"
  ON public.org_feature_flags FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- Staff can read their org's flags
CREATE POLICY "Staff can read feature flags"
  ON public.org_feature_flags FOR SELECT
  TO authenticated
  USING (public.is_org_staff(organization_id));

-- Auto-provision feature flags for new orgs
CREATE OR REPLACE FUNCTION public.provision_org_feature_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.org_feature_flags (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_org_provision_flags
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.provision_org_feature_flags();

-- Auto-enable OpenPhone features when org connects OpenPhone
CREATE OR REPLACE FUNCTION public.sync_openphone_feature_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.openphone_api_key IS NOT NULL AND NEW.openphone_api_key != '' THEN
    UPDATE public.org_feature_flags
    SET openphone_calls_enabled = true,
        ai_assistant_enabled = true,
        daily_reports_enabled = true,
        updated_at = now()
    WHERE organization_id = NEW.organization_id;
  ELSE
    UPDATE public.org_feature_flags
    SET openphone_calls_enabled = false,
        ai_assistant_enabled = false,
        daily_reports_enabled = false,
        updated_at = now()
    WHERE organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sms_settings_change_sync_flags
AFTER INSERT OR UPDATE ON public.organization_sms_settings
FOR EACH ROW EXECUTE FUNCTION public.sync_openphone_feature_flags();

-- Backfill existing orgs
INSERT INTO public.org_feature_flags (organization_id, openphone_calls_enabled, ai_assistant_enabled, daily_reports_enabled)
SELECT o.id,
  COALESCE((SELECT true FROM public.organization_sms_settings s WHERE s.organization_id = o.id AND s.openphone_api_key IS NOT NULL AND s.openphone_api_key != '' LIMIT 1), false),
  COALESCE((SELECT true FROM public.organization_sms_settings s WHERE s.organization_id = o.id AND s.openphone_api_key IS NOT NULL AND s.openphone_api_key != '' LIMIT 1), false),
  COALESCE((SELECT true FROM public.organization_sms_settings s WHERE s.organization_id = o.id AND s.openphone_api_key IS NOT NULL AND s.openphone_api_key != '' LIMIT 1), false)
FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;
