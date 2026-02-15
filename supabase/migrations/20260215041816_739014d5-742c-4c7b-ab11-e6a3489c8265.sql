ALTER TABLE public.organization_pricing_settings 
ADD COLUMN IF NOT EXISTS booking_form_theme text NOT NULL DEFAULT 'dark';