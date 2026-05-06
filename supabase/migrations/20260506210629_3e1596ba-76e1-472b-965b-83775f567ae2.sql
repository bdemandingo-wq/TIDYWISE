-- Drop combined pricing mode entirely.
-- The column lives on organization_pricing_settings (not organization_settings).
-- See migration 20260420073738_*.sql for original ADD COLUMN.

-- 1. Flip everyone OFF first so any in-flight reads see the legacy behavior.
UPDATE public.organization_pricing_settings
SET combined_pricing_enabled = false
WHERE combined_pricing_enabled = true;

-- 2. Drop the column.
ALTER TABLE public.organization_pricing_settings
DROP COLUMN IF EXISTS combined_pricing_enabled;