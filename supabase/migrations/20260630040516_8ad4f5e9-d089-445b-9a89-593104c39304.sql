ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lindy_api_key text;

COMMENT ON COLUMN public.organizations.lindy_api_key IS
  'Per-organization API key for the lindy-crm-api edge function. Validated server-side; must match the organization_id supplied in each request.';