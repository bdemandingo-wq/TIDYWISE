ALTER TABLE public.services ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_services_org_display_order ON public.services(organization_id, display_order);
-- Seed initial order alphabetically per org so existing rows aren't all 0
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY organization_id ORDER BY name) AS rn
  FROM public.services
)
UPDATE public.services s SET display_order = ranked.rn FROM ranked WHERE ranked.id = s.id AND s.display_order = 0;