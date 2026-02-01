-- Enable the pgcrypto extension (required for gen_salt and crypt functions)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate the hash function with explicit schema reference
CREATE OR REPLACE FUNCTION public.hash_client_portal_password(p_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN extensions.crypt(p_password, extensions.gen_salt('bf'));
END;
$$;

-- Recreate the validate function with explicit schema reference
CREATE OR REPLACE FUNCTION public.validate_client_portal_login(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_stored_hash TEXT;
  v_is_active BOOLEAN;
BEGIN
  -- Look up the user
  SELECT id, password_hash, is_active
  INTO v_user_id, v_stored_hash, v_is_active
  FROM public.client_portal_users
  WHERE username = LOWER(p_username);
  
  -- User not found
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'user_not_found');
  END IF;
  
  -- Check if active
  IF NOT v_is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;
  
  -- Verify password using crypt with explicit schema
  IF v_stored_hash = extensions.crypt(p_password, v_stored_hash) THEN
    RETURN jsonb_build_object('valid', true, 'user_id', v_user_id);
  ELSE
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_password');
  END IF;
END;
$$;