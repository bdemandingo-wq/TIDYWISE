CREATE OR REPLACE FUNCTION public.get_loyalty_tier_info(p_organization_id uuid)
 RETURNS TABLE(tier_name text, tier_order integer, min_spending numeric, max_spending numeric, benefits jsonb, color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := false;
  v_uid uuid;
  v_member boolean := false;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  -- Trusted server-to-server path (client-portal-api proxy). service_role has
  -- no auth.uid(); identity is resolved from the verified portal session there.
  BEGIN
    v_is_service := (auth.role() = 'service_role');
  EXCEPTION WHEN OTHERS THEN
    v_is_service := false;
  END;

  IF NOT v_is_service THEN
    -- Fail closed: any error resolving membership refuses.
    BEGIN
      v_uid := auth.uid();
      v_member := (v_uid IS NOT NULL) AND public.is_org_member(p_organization_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Not authorized to read loyalty tiers for this organization';
    END;

    IF NOT v_member THEN
      RAISE EXCEPTION 'Not authorized to read loyalty tiers for this organization';
    END IF;
  END IF;

  -- Return custom tiers if they exist, otherwise return default tiers
  IF EXISTS (SELECT 1 FROM public.client_tier_settings WHERE organization_id = p_organization_id) THEN
    RETURN QUERY
    SELECT
      cts.tier_name,
      cts.tier_order,
      cts.min_spending,
      cts.max_spending,
      cts.benefits,
      cts.color
    FROM public.client_tier_settings cts
    WHERE cts.organization_id = p_organization_id
    ORDER BY cts.tier_order;
  ELSE
    RETURN QUERY
    SELECT 'Bronze'::TEXT, 1, 0::NUMERIC, 499::NUMERIC, '["Welcome reward"]'::JSONB, '#CD7F32'::TEXT
    UNION ALL
    SELECT 'Silver'::TEXT, 2, 500::NUMERIC, 1999::NUMERIC, '["5% discount", "Priority booking"]'::JSONB, '#C0C0C0'::TEXT
    UNION ALL
    SELECT 'Gold'::TEXT, 3, 2000::NUMERIC, 4999::NUMERIC, '["10% discount", "Priority booking", "Free add-on"]'::JSONB, '#FFD700'::TEXT
    UNION ALL
    SELECT 'Platinum'::TEXT, 4, 5000::NUMERIC, NULL::NUMERIC, '["15% discount", "Priority booking", "Free add-on", "VIP support"]'::JSONB, '#E5E4E2'::TEXT
    ORDER BY 2;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_loyalty_tier_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_loyalty_tier_info(uuid) TO service_role;