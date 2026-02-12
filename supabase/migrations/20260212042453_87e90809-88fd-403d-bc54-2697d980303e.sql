
-- Add loyalty_program_enabled to organization_pricing_settings
ALTER TABLE public.organization_pricing_settings 
ADD COLUMN IF NOT EXISTS loyalty_program_enabled boolean NOT NULL DEFAULT true;
