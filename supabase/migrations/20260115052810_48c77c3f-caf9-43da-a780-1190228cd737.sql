-- Create SEO metadata table for pages
CREATE TABLE public.page_seo_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  page_path TEXT NOT NULL,
  seo_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  canonical_url TEXT,
  no_index BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, page_path)
);

-- Enable RLS
ALTER TABLE public.page_seo_metadata ENABLE ROW LEVEL SECURITY;

-- Create policies for organization-specific access
CREATE POLICY "Users can view their organization's SEO metadata"
ON public.page_seo_metadata
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert SEO metadata for their organization"
ON public.page_seo_metadata
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their organization's SEO metadata"
ON public.page_seo_metadata
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their organization's SEO metadata"
ON public.page_seo_metadata
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_page_seo_metadata_updated_at
BEFORE UPDATE ON public.page_seo_metadata
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();