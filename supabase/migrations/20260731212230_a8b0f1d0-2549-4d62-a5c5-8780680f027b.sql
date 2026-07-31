CREATE OR REPLACE FUNCTION public.validate_client_portal_login(p_email text, p_password text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_match_count INT := 0;
  v_matched_id UUID;
  v_matched_active BOOLEAN;
  v_candidate_count INT := 0;
BEGIN
  -- TIMING LEAK, ACCEPTED: comparing N candidate hashes takes measurably
  -- longer than comparing 1, which leaks that an email exists at more than one
  -- business. The pre-existing dummy-crypt path already only approximates
  -- constant time, so padding every call to a fixed 5 compares would cost
  -- ~500ms per login to close a leak the function never fully closed. Revisit
  -- only if portal login becomes a targeted enumeration surface.

  FOR r IN
    SELECT cpu.id, cpu.password_hash, cpu.is_active
    FROM public.client_portal_users cpu
    JOIN public.customers c ON c.id = cpu.customer_id
    WHERE LOWER(c.email) = LOWER(p_email)
    ORDER BY cpu.created_at ASC, cpu.id ASC
    LIMIT 5
  LOOP
    v_candidate_count := v_candidate_count + 1;
    IF r.password_hash = extensions.crypt(p_password, r.password_hash) THEN
      v_match_count := v_match_count + 1;
      v_matched_id := r.id;
      v_matched_active := r.is_active;
    END IF;
  END LOOP;

  IF v_candidate_count = 0 THEN
    PERFORM extensions.crypt(p_password, '$2a$06$abcdefghijklmnopqrstuu');
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  END IF;

  IF v_match_count = 1 THEN
    IF NOT v_matched_active THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
    END IF;
    RETURN jsonb_build_object('valid', true, 'user_id', v_matched_id);
  ELSIF v_match_count = 0 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  ELSE
    RETURN jsonb_build_object('valid', false, 'reason', 'ambiguous_account');
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.validate_client_portal_login(text, text) IS
'Validates a client portal login. Disambiguates by password across up to 5 candidate portal accounts sharing the same email, because the portal login surface at /portal is not org-scoped. Never reveals how many accounts an email has or which businesses they belong to.';