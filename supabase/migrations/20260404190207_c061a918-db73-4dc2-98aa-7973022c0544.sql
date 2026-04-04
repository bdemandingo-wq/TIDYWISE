
-- Create a view that excludes password_hash for admin use
CREATE OR REPLACE VIEW public.client_portal_users_safe AS
SELECT 
  id, customer_id, username, must_change_password, 
  is_active, last_login_at, created_at, updated_at, organization_id
FROM public.client_portal_users;

-- Grant access to the view
GRANT SELECT ON public.client_portal_users_safe TO authenticated;

-- Enable RLS on the underlying table already exists
-- The view inherits the RLS of the underlying table since it's not SECURITY DEFINER

-- Create a SECURITY DEFINER function for inserting portal users with password
-- This avoids needing to grant INSERT on password_hash column directly
CREATE OR REPLACE FUNCTION public.create_client_portal_user(
  p_username text,
  p_password text,
  p_customer_id uuid,
  p_organization_id uuid,
  p_must_change_password boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Verify caller is an admin of this organization
  SELECT EXISTS(
    SELECT 1 FROM org_memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND role IN ('admin', 'owner')
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only organization admins can create portal users';
  END IF;
  
  INSERT INTO public.client_portal_users (
    username, password_hash, customer_id, organization_id, 
    is_active, must_change_password
  ) VALUES (
    LOWER(TRIM(p_username)),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    p_customer_id,
    p_organization_id,
    true,
    p_must_change_password
  )
  RETURNING id INTO v_user_id;
  
  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_client_portal_user(text, text, uuid, uuid, boolean) TO authenticated;
