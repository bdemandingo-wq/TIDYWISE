-- Organization-level mobile bottom navigation settings (role-based)
CREATE TABLE IF NOT EXISTS public.organization_mobile_nav_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, role)
);

ALTER TABLE public.organization_mobile_nav_settings ENABLE ROW LEVEL SECURITY;

-- Members can view their org's nav settings
CREATE POLICY "Org members can view mobile nav settings"
ON public.organization_mobile_nav_settings
FOR SELECT
USING (public.is_org_member(organization_id));

-- Only org admins/owners can manage settings
CREATE POLICY "Org admins can insert mobile nav settings"
ON public.organization_mobile_nav_settings
FOR INSERT
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update mobile nav settings"
ON public.organization_mobile_nav_settings
FOR UPDATE
USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete mobile nav settings"
ON public.organization_mobile_nav_settings
FOR DELETE
USING (public.is_org_admin(organization_id));

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_org_mobile_nav_settings_org
  ON public.organization_mobile_nav_settings(organization_id);

-- Timestamps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_organization_mobile_nav_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_organization_mobile_nav_settings_updated_at
    BEFORE UPDATE ON public.organization_mobile_nav_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;