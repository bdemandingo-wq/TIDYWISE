CREATE OR REPLACE FUNCTION public.ai_daily_limit_for_tier(_tier TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _tier
    WHEN 'custom' THEN 75
    WHEN 'pro'   THEN 30
    WHEN 'basic' THEN 10
    ELSE 5  -- trial or unknown
  END;
$$;