CREATE TABLE public.lead_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_pipeline_stages TO authenticated;
GRANT ALL ON public.lead_pipeline_stages TO service_role;

ALTER TABLE public.lead_pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view lead stages" ON public.lead_pipeline_stages
  FOR SELECT TO authenticated USING (is_org_member(organization_id));
CREATE POLICY "Org admins can insert lead stages" ON public.lead_pipeline_stages
  FOR INSERT TO authenticated WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "Org admins can update lead stages" ON public.lead_pipeline_stages
  FOR UPDATE TO authenticated USING (is_org_admin(organization_id));
CREATE POLICY "Org admins can delete lead stages" ON public.lead_pipeline_stages
  FOR DELETE TO authenticated USING (is_org_admin(organization_id));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status ~ '^[a-z0-9_]{1,40}$');