-- Move pg_net extension from public to extensions schema
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Add unique partial index to prevent multiple business_settings rows per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_settings_unique_org
  ON public.business_settings (organization_id)
  WHERE organization_id IS NOT NULL;