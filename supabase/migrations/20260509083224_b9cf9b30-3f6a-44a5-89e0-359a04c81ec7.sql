
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.score_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  city_slug TEXT,
  zip TEXT,
  formatted_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  website TEXT,
  phone TEXT,
  google_place_id TEXT UNIQUE,
  google_rating NUMERIC(3,2),
  google_review_count INTEGER DEFAULT 0,
  score INTEGER,
  score_grade TEXT,
  city_rank INTEGER,
  city_total INTEGER,
  claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_organization_id UUID,
  claimed_at TIMESTAMPTZ,
  last_scored_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'on_demand',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_companies_city_slug ON public.score_companies(city_slug);
CREATE INDEX IF NOT EXISTS idx_score_companies_state ON public.score_companies(state);
CREATE INDEX IF NOT EXISTS idx_score_companies_score ON public.score_companies(score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_score_companies_name_trgm ON public.score_companies USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.score_company_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.score_companies(id) ON DELETE CASCADE,
  reviews_score INTEGER,
  sentiment_reliability INTEGER,
  sentiment_communication INTEGER,
  sentiment_quality INTEGER,
  sentiment_value INTEGER,
  website_score INTEGER,
  website_has_https BOOLEAN,
  website_mobile_friendly BOOLEAN,
  website_has_booking BOOLEAN,
  website_load_ms INTEGER,
  review_themes JSONB,
  ai_tips JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.score_top_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  city_slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_featured BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.score_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.score_companies(id) ON DELETE CASCADE,
  claimant_name TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  claimant_phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_organization_id UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_claim_requests_company ON public.score_claim_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_score_claim_requests_status ON public.score_claim_requests(status);

CREATE OR REPLACE FUNCTION public.score_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_score_companies_updated ON public.score_companies;
CREATE TRIGGER trg_score_companies_updated
BEFORE UPDATE ON public.score_companies
FOR EACH ROW EXECUTE FUNCTION public.score_set_updated_at();

ALTER TABLE public.score_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_company_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_top_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_claim_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read score_companies"
ON public.score_companies FOR SELECT USING (true);

CREATE POLICY "Public can read score_company_metrics"
ON public.score_company_metrics FOR SELECT USING (true);

CREATE POLICY "Public can read score_top_cities"
ON public.score_top_cities FOR SELECT USING (true);

CREATE POLICY "Anyone can insert claim_requests"
ON public.score_claim_requests FOR INSERT WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_platform_admin') THEN
    EXECUTE 'CREATE POLICY "Platform admins read claim_requests" ON public.score_claim_requests FOR SELECT USING (public.is_platform_admin(auth.uid()))';
    EXECUTE 'CREATE POLICY "Platform admins update claim_requests" ON public.score_claim_requests FOR UPDATE USING (public.is_platform_admin(auth.uid()))';
    EXECUTE 'CREATE POLICY "Platform admins manage score_companies" ON public.score_companies FOR ALL USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()))';
    EXECUTE 'CREATE POLICY "Platform admins manage score_top_cities" ON public.score_top_cities FOR ALL USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()))';
  END IF;
END $$;

INSERT INTO public.score_top_cities (city, state, city_slug, display_order) VALUES
  ('New York','NY','new-york-ny',10),
  ('Los Angeles','CA','los-angeles-ca',20),
  ('Chicago','IL','chicago-il',30),
  ('Houston','TX','houston-tx',40),
  ('Phoenix','AZ','phoenix-az',50),
  ('Philadelphia','PA','philadelphia-pa',60),
  ('San Antonio','TX','san-antonio-tx',70),
  ('San Diego','CA','san-diego-ca',80),
  ('Dallas','TX','dallas-tx',90),
  ('Austin','TX','austin-tx',100),
  ('Jacksonville','FL','jacksonville-fl',110),
  ('Fort Worth','TX','fort-worth-tx',120),
  ('Columbus','OH','columbus-oh',130),
  ('Charlotte','NC','charlotte-nc',140),
  ('Indianapolis','IN','indianapolis-in',150),
  ('San Francisco','CA','san-francisco-ca',160),
  ('Seattle','WA','seattle-wa',170),
  ('Denver','CO','denver-co',180),
  ('Washington','DC','washington-dc',190),
  ('Boston','MA','boston-ma',200),
  ('Nashville','TN','nashville-tn',210),
  ('Miami','FL','miami-fl',220),
  ('Atlanta','GA','atlanta-ga',230),
  ('Portland','OR','portland-or',240),
  ('Las Vegas','NV','las-vegas-nv',250)
ON CONFLICT (city_slug) DO NOTHING;
