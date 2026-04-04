
-- Re-grant table-level permissions first, then restrict password_hash
-- The RLS policies already restrict WHO can access, this restricts WHAT columns

-- Grant SELECT on all columns EXCEPT password_hash
GRANT SELECT (id, customer_id, username, must_change_password, is_active, last_login_at, created_at, updated_at, organization_id) ON public.client_portal_users TO authenticated;

-- Grant full INSERT (password_hash is set via RPC hash function)
GRANT INSERT (id, customer_id, username, password_hash, must_change_password, is_active, last_login_at, created_at, updated_at, organization_id) ON public.client_portal_users TO authenticated;

-- Grant UPDATE on non-sensitive columns only
GRANT UPDATE (username, must_change_password, is_active, organization_id, updated_at) ON public.client_portal_users TO authenticated;

-- Grant DELETE
GRANT DELETE ON public.client_portal_users TO authenticated;
