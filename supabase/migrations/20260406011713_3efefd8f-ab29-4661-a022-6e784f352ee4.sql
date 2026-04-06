
CREATE TABLE public.invoice_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text DEFAULT '#3b82f6',
  accent_color text DEFAULT '#e5e7eb',
  font_style text DEFAULT 'modern',
  header_layout text DEFAULT 'left',
  footer_message text DEFAULT 'Thank you for your business!',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.invoice_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage invoice branding"
  ON public.invoice_branding FOR ALL
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org members can view invoice branding"
  ON public.invoice_branding FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));
