
-- 1. Lock down column-level UPDATE on public.organizations for authenticated users.
-- Owners may still update display fields, but billing-state columns are off-limits.
REVOKE UPDATE ON public.organizations FROM authenticated;
GRANT UPDATE (name, slug, logo_url, updated_at) ON public.organizations TO authenticated;

-- 2. Same treatment for public.profiles — block self-service subscription flag tampering.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, phone, email, updated_at) ON public.profiles TO authenticated;

-- 3. Collapse the client-portal login response so it can't be used as an
-- account-enumeration oracle. Wrong email and wrong password both return
-- the same {valid:false, reason:'invalid_credentials'} shape.
CREATE OR REPLACE FUNCTION public.validate_client_portal_login(p_email text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_stored_hash TEXT;
  v_is_active BOOLEAN;
BEGIN
  SELECT cpu.id, cpu.password_hash, cpu.is_active
  INTO v_user_id, v_stored_hash, v_is_active
  FROM public.client_portal_users cpu
  JOIN public.customers c ON c.id = cpu.customer_id
  WHERE LOWER(c.email) = LOWER(p_email);

  IF v_user_id IS NULL THEN
    -- Run a dummy bcrypt compare to keep timing roughly constant.
    PERFORM extensions.crypt(p_password, '$2a$06$abcdefghijklmnopqrstuu');
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  END IF;

  IF NOT v_is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;

  IF v_stored_hash = extensions.crypt(p_password, v_stored_hash) THEN
    RETURN jsonb_build_object('valid', true, 'user_id', v_user_id);
  ELSE
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  END IF;
END;
$function$;
