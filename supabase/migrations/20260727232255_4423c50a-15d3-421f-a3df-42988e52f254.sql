ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS website_url text;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_website_url_scheme;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_website_url_scheme
    CHECK (
      website_url IS NULL
      OR website_url ~* '^https?://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(/.*)?$'
    );