ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_header_layout text DEFAULT 'left'
    CHECK (invoice_header_layout IN ('left','center','right')),
  ADD COLUMN IF NOT EXISTS invoice_footer_message text;

UPDATE public.business_settings bs
SET invoice_header_layout  = COALESCE(ib.header_layout, 'left'),
    invoice_footer_message = ib.footer_message
FROM public.invoice_branding ib
WHERE ib.organization_id = bs.organization_id;

UPDATE public.business_settings bs
SET logo_url = ib.logo_url
FROM public.invoice_branding ib
WHERE ib.organization_id = bs.organization_id
  AND ib.logo_url IS NOT NULL
  AND (bs.logo_url IS NULL OR bs.logo_url = '');