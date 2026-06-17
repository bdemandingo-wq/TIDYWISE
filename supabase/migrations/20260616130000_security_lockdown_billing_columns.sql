-- ============================================================================
-- Security fix: lock down customer-writable billing/ownership state.
--
-- Reported issue (verified): the "Org owners can update their organization"
-- RLS policy scopes UPDATE by row (owner_id = auth.uid()) but does NOT
-- restrict WHICH columns the owner may set. Because Supabase grants the
-- `authenticated` role table-wide UPDATE and relies on RLS, an owner could
-- PATCH billing-state columns on their own org row:
--   {"plan_type":"lifetime","grandfathered_lifetime":true,...}
-- public.has_active_subscription() (Branch B) and the check-subscription
-- edge function (Step 0) both TRUST those columns, so a trial user could
-- self-grant permanent paid access and lift the RESTRICTIVE "Require active
-- subscription" insert gates on customers/bookings/invoices/quotes/estimates.
--
-- A plain `REVOKE UPDATE (col) ... FROM authenticated` is NOT reliable here:
-- the table-wide UPDATE grant Supabase installs still covers every column, so
-- the column-level revoke is shadowed. We instead enforce immutability with a
-- BEFORE UPDATE trigger, which is authoritative regardless of grants and is
-- safe even if a column never landed on this project (we compare via jsonb,
-- so a missing column is simply skipped rather than erroring).
--
-- Privileged callers are unaffected:
--   - service_role  -> Stripe webhooks, admin tooling, edge functions
--   - postgres / supabase_admin / supabase_auth_admin -> migrations, internal
--   - SECURITY DEFINER RPCs run as their (privileged) owner
-- Only `authenticated` and `anon` are constrained.
-- ============================================================================

-- ── 1. Generic guard: reject changes to protected columns for end-user roles ─
-- Uses to_jsonb(OLD/NEW) + a key allowlist so it never references a column
-- that may not exist on this database. Unchanged values pass (IS DISTINCT
-- FROM), so normal updates that echo the full row are unaffected.

-- IMPORTANT: SECURITY INVOKER (the default). This function relies on
-- current_user reflecting the REQUEST role (authenticated / anon /
-- service_role / postgres). A SECURITY DEFINER would make current_user the
-- function owner, which would make every check bypass — do not change this.
CREATE OR REPLACE FUNCTION public.reject_protected_column_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  protected_cols text[] := TG_ARGV;   -- passed per-trigger
  col text;
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
BEGIN
  -- Privileged roles (service_role, postgres, supabase_*) bypass entirely.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  FOREACH col IN ARRAY protected_cols LOOP
    IF (old_j ? col) AND (new_j ? col)
       AND (old_j -> col IS DISTINCT FROM new_j -> col) THEN
      RAISE EXCEPTION
        'Column "%" on % is managed by billing/admin and cannot be modified by this role', col, TG_TABLE_NAME
        USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 2. organizations: protect billing + ownership columns ────────────────────
DROP TRIGGER IF EXISTS protect_org_billing_columns ON public.organizations;
CREATE TRIGGER protect_org_billing_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_protected_column_change(
    'plan_type', 'grandfathered_lifetime', 'grandfathered_at', 'owner_id'
  );

-- ── 3. profiles: protect subscription-state drift columns (defense in depth) ─
-- These aren't currently used to entitle features, but keeping them in sync
-- with real auth/Stripe state and out of user control closes future drift.
-- Columns that don't exist on this project are skipped automatically.
DROP TRIGGER IF EXISTS protect_profile_billing_columns ON public.profiles;
CREATE TRIGGER protect_profile_billing_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_protected_column_change(
    'subscription_tier', 'subscription_status', 'trial_ends_at', 'billing_cycle'
  );

-- ── 4. Close the client-portal login enumeration oracle ──────────────────────
-- Previously returned distinct reasons ('user_not_found' vs 'invalid_password'),
-- letting any HTTP client enumerate which customer emails are registered across
-- every tenant. Collapse both into a single 'invalid_credentials' reason and
-- equalize timing for the not-found path. 'inactive' is only revealed AFTER a
-- correct password, so it leaks nothing to an enumerator.
CREATE OR REPLACE FUNCTION public.validate_client_portal_login(p_email TEXT, p_password TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Unknown email: burn a hash to equalize timing, return the generic reason.
  IF v_user_id IS NULL OR v_stored_hash IS NULL THEN
    PERFORM extensions.crypt(p_password, extensions.gen_salt('bf'));
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  END IF;

  -- Wrong password: same generic reason as unknown email (no enumeration).
  IF v_stored_hash <> extensions.crypt(p_password, v_stored_hash) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  END IF;

  -- Correct password but disabled account — safe to disclose at this point.
  IF NOT v_is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'inactive');
  END IF;

  RETURN jsonb_build_object('valid', true, 'user_id', v_user_id);
END;
$$;
