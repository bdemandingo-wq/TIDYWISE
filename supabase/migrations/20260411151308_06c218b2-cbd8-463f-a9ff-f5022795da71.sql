CREATE OR REPLACE FUNCTION public.stripe_duplicate_accounts()
RETURNS TABLE (
  stripe_account_id TEXT,
  org_count BIGINT,
  organization_ids UUID[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    stripe_account_id,
    COUNT(*)::bigint AS org_count,
    array_agg(organization_id) AS organization_ids
  FROM org_stripe_settings
  WHERE stripe_account_id IS NOT NULL
  GROUP BY stripe_account_id
  HAVING COUNT(*) > 1;
$$;