ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS leads_tags_gin_idx ON public.leads USING gin (tags);