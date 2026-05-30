ALTER TABLE public.score_company_metrics
ADD COLUMN IF NOT EXISTS sentiment_evidence jsonb NOT NULL DEFAULT '{}'::jsonb;