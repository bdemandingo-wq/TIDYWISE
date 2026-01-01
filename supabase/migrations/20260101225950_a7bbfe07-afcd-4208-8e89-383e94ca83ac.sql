-- Create inventory_categories table for custom categories
CREATE TABLE public.inventory_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create inventory_custom_fields table for dynamic form fields
CREATE TABLE public.inventory_custom_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text, number, select
  is_required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  options JSONB, -- For select type fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add custom_fields column to inventory_items for storing dynamic field values
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Enable RLS
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_custom_fields ENABLE ROW LEVEL SECURITY;

-- RLS policies for inventory_categories
CREATE POLICY "Users can view their org inventory categories"
ON public.inventory_categories FOR SELECT
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can create inventory categories for their org"
ON public.inventory_categories FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Users can update their org inventory categories"
ON public.inventory_categories FOR UPDATE
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can delete their org inventory categories"
ON public.inventory_categories FOR DELETE
USING (public.is_org_member(organization_id));

-- RLS policies for inventory_custom_fields
CREATE POLICY "Users can view their org inventory custom fields"
ON public.inventory_custom_fields FOR SELECT
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can create inventory custom fields for their org"
ON public.inventory_custom_fields FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Users can update their org inventory custom fields"
ON public.inventory_custom_fields FOR UPDATE
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can delete their org inventory custom fields"
ON public.inventory_custom_fields FOR DELETE
USING (public.is_org_member(organization_id));

-- Add triggers for updated_at
CREATE TRIGGER update_inventory_categories_updated_at
BEFORE UPDATE ON public.inventory_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_custom_fields_updated_at
BEFORE UPDATE ON public.inventory_custom_fields
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();