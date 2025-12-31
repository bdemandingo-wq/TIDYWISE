-- Add show_bed_bath_on_booking column to organization_pricing_settings
ALTER TABLE public.organization_pricing_settings
ADD COLUMN show_bed_bath_on_booking boolean DEFAULT true;