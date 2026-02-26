
-- Create SMS message templates table
CREATE TABLE public.sms_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- Org members can view templates
CREATE POLICY "Org members can view templates"
  ON public.sms_templates FOR SELECT
  USING (public.is_org_member(organization_id));

-- Org admins can manage templates
CREATE POLICY "Org admins can insert templates"
  ON public.sms_templates FOR INSERT
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update templates"
  ON public.sms_templates FOR UPDATE
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete templates"
  ON public.sms_templates FOR DELETE
  USING (public.is_org_admin(organization_id));

-- Index for fast lookups
CREATE INDEX idx_sms_templates_org ON public.sms_templates(organization_id);

-- Updated_at trigger
CREATE TRIGGER update_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
