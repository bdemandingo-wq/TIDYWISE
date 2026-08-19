CREATE OR REPLACE FUNCTION public.submit_review_by_token(p_token text, p_rating integer, p_review_text text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_customer_id uuid;
  v_org_id uuid;
  v_customer_name text;
  v_issue text;
  v_tz text;
  v_feedback_date date;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN false;
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN false;
  END IF;

  SELECT id, customer_id, organization_id
    INTO v_id, v_customer_id, v_org_id
  FROM public.review_requests
  WHERE review_link_token = p_token
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.review_requests
  SET rating = p_rating,
      review_text = COALESCE(p_review_text, review_text),
      status = 'completed',
      responded_at = COALESCE(responded_at, now())
  WHERE id = v_id;

  IF v_customer_id IS NOT NULL THEN
    SELECT trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
      INTO v_customer_name
    FROM public.customers c
    WHERE c.id = v_customer_id;

    SELECT bs.timezone INTO v_tz
    FROM public.business_settings bs
    WHERE bs.organization_id = v_org_id
    LIMIT 1;

    v_tz := COALESCE(NULLIF(v_tz, ''), 'America/New_York');
    v_feedback_date := (now() AT TIME ZONE v_tz)::date;

    v_issue := COALESCE(NULLIF(btrim(p_review_text), ''),
                        'Customer gave ' || p_rating || ' star rating');

    BEGIN
      INSERT INTO public.client_feedback (
        organization_id, customer_name, issue_description,
        feedback_date, is_resolved, followup_needed
      ) VALUES (
        v_org_id, v_customer_name, v_issue, v_feedback_date, false, true
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'submit_review_by_token: client_feedback insert failed (review_request=%, org=%, customer=%): % [%]',
        v_id, v_org_id, v_customer_id, SQLERRM, SQLSTATE;
    END;
  END IF;

  RETURN true;
END;
$function$;

DROP POLICY IF EXISTS "Anyone can insert client feedback from review" ON public.client_feedback;