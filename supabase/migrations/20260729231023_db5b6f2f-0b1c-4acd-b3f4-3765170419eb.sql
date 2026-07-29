-- SECTION 1
CREATE TABLE IF NOT EXISTS public.loyalty_tier_correction_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,
  customer_id uuid NOT NULL,
  organization_id uuid,
  completed_spend numeric(12,2),
  stored_tier text,
  correct_tier text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.loyalty_tier_correction_audit TO authenticated;
GRANT ALL ON public.loyalty_tier_correction_audit TO service_role;
ALTER TABLE public.loyalty_tier_correction_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can read their loyalty correction audit" ON public.loyalty_tier_correction_audit;
CREATE POLICY "Org members can read their loyalty correction audit"
ON public.loyalty_tier_correction_audit
FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

INSERT INTO public.loyalty_tier_correction_audit
  (phase, customer_id, organization_id, completed_spend, stored_tier, correct_tier)
SELECT 'before',
       c.id,
       c.organization_id,
       COALESCE(s.spend, 0),
       cl.tier,
       (SELECT cts.tier_name
          FROM public.client_tier_settings cts
         WHERE cts.organization_id = c.organization_id
           AND COALESCE(s.spend,0) >= cts.min_spending
           AND (cts.max_spending IS NULL OR COALESCE(s.spend,0) <= cts.max_spending)
         ORDER BY cts.tier_order DESC
         LIMIT 1)
FROM public.customers c
JOIN public.customer_loyalty cl ON cl.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, sum(total_amount) AS spend
  FROM public.bookings
  WHERE status = 'completed' AND customer_id IS NOT NULL
  GROUP BY customer_id
) s ON s.customer_id = c.id;

-- SECTION 2
ALTER TABLE public.customer_loyalty
  ADD COLUMN IF NOT EXISTS lifetime_spend numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.customer_loyalty.lifetime_spend IS
  'Monotonic lifetime spend in dollars, accumulated from completed bookings. INCREMENT-ONLY — never decrement on any path. Refunds, post-completion charge edits, and status reversals must not reduce it: a refund must not demote a customer. Backfilled 2026-07-29 from sum(bookings.total_amount) where status=completed. Baseline is "spend as currently recorded", not "as originally charged" — edit history is not retained. This is the tier basis, compared against client_tier_settings.min_spending.';

UPDATE public.customer_loyalty cl
SET lifetime_spend = COALESCE(b.spend, 0),
    updated_at = now()
FROM (
  SELECT customer_id, sum(total_amount) AS spend
  FROM public.bookings
  WHERE status = 'completed' AND customer_id IS NOT NULL
  GROUP BY customer_id
) b
WHERE b.customer_id = cl.customer_id;

INSERT INTO public.customer_loyalty
  (customer_id, organization_id, points, lifetime_points, lifetime_spend)
SELECT b.customer_id,
       (array_agg(b.organization_id ORDER BY b.created_at))[1],
       0, 0,
       sum(b.total_amount)
FROM public.bookings b
WHERE b.status = 'completed'
  AND b.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_loyalty cl WHERE cl.customer_id = b.customer_id
  )
GROUP BY b.customer_id;

-- SECTION 3
CREATE OR REPLACE FUNCTION public.get_org_tiers(p_organization_id uuid)
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

  BEGIN
    v_is_service := (session_user = 'service_role')
                    OR (current_setting('role', true) = 'service_role')
                    OR (auth.role() = 'service_role');
  EXCEPTION WHEN OTHERS THEN
    v_is_service := (session_user = 'service_role');
  END;

  IF NOT v_is_service THEN
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

  IF EXISTS (SELECT 1 FROM public.client_tier_settings WHERE organization_id = p_organization_id) THEN
    RETURN QUERY
    SELECT cts.tier_name, cts.tier_order, cts.min_spending, cts.max_spending, cts.benefits, cts.color
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

REVOKE ALL ON FUNCTION public.get_org_tiers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_tiers(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_customer_tier(p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := false;
  v_uid uuid;
  v_member boolean := false;
  v_org uuid;
  v_spend numeric := 0;
  v_tier text;
BEGIN
  IF p_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT organization_id INTO v_org FROM public.customers WHERE id = p_customer_id;
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_is_service := (session_user = 'service_role')
                    OR (current_setting('role', true) = 'service_role')
                    OR (auth.role() = 'service_role');
  EXCEPTION WHEN OTHERS THEN
    v_is_service := (session_user = 'service_role');
  END;

  IF NOT v_is_service THEN
    BEGIN
      v_uid := auth.uid();
      v_member := (v_uid IS NOT NULL) AND public.is_org_member(v_org);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Not authorized to resolve loyalty tier for this customer';
    END;

    IF NOT v_member THEN
      RAISE EXCEPTION 'Not authorized to resolve loyalty tier for this customer';
    END IF;
  END IF;

  SELECT COALESCE(lifetime_spend, 0) INTO v_spend
  FROM public.customer_loyalty WHERE customer_id = p_customer_id;
  v_spend := COALESCE(v_spend, 0);

  IF EXISTS (SELECT 1 FROM public.client_tier_settings WHERE organization_id = v_org) THEN
    SELECT cts.tier_name INTO v_tier
    FROM public.client_tier_settings cts
    WHERE cts.organization_id = v_org
      AND v_spend >= cts.min_spending
      AND (cts.max_spending IS NULL OR v_spend <= cts.max_spending)
    ORDER BY cts.tier_order DESC
    LIMIT 1;
    RETURN v_tier;
  END IF;

  -- Default fallback tiers (same as get_org_tiers)
  IF v_spend >= 5000 THEN RETURN 'Platinum';
  ELSIF v_spend >= 2000 THEN RETURN 'Gold';
  ELSIF v_spend >= 500 THEN RETURN 'Silver';
  ELSIF v_spend >= 0 THEN RETURN 'Bronze';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_customer_tier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_customer_tier(uuid) TO authenticated, service_role;

-- SECTION 4
CREATE OR REPLACE FUNCTION public.award_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  points_to_award INTEGER;
  spend_to_award NUMERIC;
  existing_loyalty_id UUID;
  is_new_completion BOOLEAN;
BEGIN
  is_new_completion := (TG_OP = 'INSERT' AND NEW.status = 'completed')
    OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed');

  IF is_new_completion AND NEW.customer_id IS NOT NULL THEN
    -- Idempotency guard: never credit the same booking twice.
    IF EXISTS (
      SELECT 1 FROM public.loyalty_transactions
      WHERE booking_id = NEW.id AND transaction_type = 'earned'
    ) THEN
      RETURN NEW;
    END IF;

    points_to_award := FLOOR(COALESCE(NEW.total_amount, 0));
    spend_to_award := COALESCE(NEW.total_amount, 0);

    SELECT id INTO existing_loyalty_id
    FROM public.customer_loyalty
    WHERE customer_id = NEW.customer_id;

    IF existing_loyalty_id IS NULL THEN
      INSERT INTO public.customer_loyalty (customer_id, organization_id, points, lifetime_points, lifetime_spend)
      VALUES (NEW.customer_id, NEW.organization_id, points_to_award, points_to_award, spend_to_award);
    ELSE
      UPDATE public.customer_loyalty
      SET points = COALESCE(points, 0) + points_to_award,
          lifetime_points = COALESCE(lifetime_points, 0) + points_to_award,
          lifetime_spend = COALESCE(lifetime_spend, 0) + spend_to_award,
          updated_at = now()
      WHERE id = existing_loyalty_id;
    END IF;

    INSERT INTO public.loyalty_transactions (customer_id, booking_id, points, transaction_type, description, organization_id)
    VALUES (NEW.customer_id, NEW.id, points_to_award, 'earned', 'Points earned from booking #' || NEW.booking_number, NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS award_loyalty_points_trigger ON public.bookings;
DROP TRIGGER IF EXISTS trigger_award_loyalty_points ON public.bookings;
DROP TRIGGER IF EXISTS award_loyalty_points ON public.bookings;
CREATE TRIGGER award_loyalty_points_trigger
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.award_loyalty_points();

-- Legacy check limited tier to bronze/silver/gold/platinum; org-defined names are now stored.
ALTER TABLE public.customer_loyalty DROP CONSTRAINT IF EXISTS customer_loyalty_tier_check;

UPDATE public.customer_loyalty cl
SET tier = public.resolve_customer_tier(cl.customer_id),
    updated_at = now();

COMMENT ON COLUMN public.customer_loyalty.tier IS
  'FROZEN 2026-07-29. No longer maintained by any trigger. Corrected once from resolve_customer_tier() at that date. Tier is now DERIVED — call resolve_customer_tier(customer_id) or get_org_tiers(organization_id). This column is a transitional snapshot and will go stale if an org edits its thresholds. Do not write to it.';

-- SECTION 5
INSERT INTO public.loyalty_tier_correction_audit
  (phase, customer_id, organization_id, completed_spend, stored_tier, correct_tier)
SELECT 'after', cl.customer_id, cl.organization_id, cl.lifetime_spend,
       cl.tier, public.resolve_customer_tier(cl.customer_id)
FROM public.customer_loyalty cl;