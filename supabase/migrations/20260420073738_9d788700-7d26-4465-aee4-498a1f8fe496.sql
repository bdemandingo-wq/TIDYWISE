-- Add combined_pricing_enabled flag to organization_pricing_settings
-- Defaults to FALSE so all existing orgs keep their current sqft-only pricing behavior
ALTER TABLE public.organization_pricing_settings
ADD COLUMN IF NOT EXISTS combined_pricing_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organization_pricing_settings.combined_pricing_enabled IS
'When true, estimates add Bedroom/Bath pricing on top of Square Footage pricing. When false (default), only Square Footage tier is used. Per-org opt-in.';