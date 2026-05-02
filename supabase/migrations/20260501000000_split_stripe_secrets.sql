-- Option B: split Stripe credentials into a dedicated server-side-only table.
--
-- Background. The previous hardening migration
-- (20260430165601_security_harden_stripe_secrets_and_portal_sessions.sql)
-- column-level REVOKEd SELECT on stripe_secret_key, stripe_access_token, and
-- stripe_refresh_token from anon/authenticated. That stops casual leakage but
-- still leaves the secrets sitting on a row that admin/owner clients can pull
-- (just with those columns nulled out). A misconfigured policy, a future
-- column rename, or a permissive grant could re-expose them.
--
-- This migration eliminates the risk physically:
--
--   1. New table `org_stripe_secrets` holds the three secret values. RLS is
--      enabled with NO policies for anon/authenticated, plus an explicit
--      `REVOKE ALL` on those roles. Only service_role (used by Edge
--      Functions) can read or write the table.
--   2. Existing values are copied across, then the secret columns are
--      dropped from `org_stripe_settings`. Admin/owner clients keep their
--      access to the non-sensitive columns (is_connected, stripe_account_id,
--      etc.) via the existing policies.
--   3. `security_audit_log` records every server-side read of a secret so we
--      can review who-asked-for-what after the fact. A SECURITY DEFINER
--      function `get_org_stripe_secret` is the canonical access path.
--   4. The helper RPC `find_org_by_stripe_secret` lets the connect-oauth
--      cross-tenant guard look up an org by raw secret without granting any
--      role direct SELECT on the secrets table.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. org_stripe_secrets — server-only secret store
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.org_stripe_secrets (
  organization_id UUID PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_secret_key TEXT,
  stripe_access_token TEXT,
  stripe_refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_stripe_secrets ENABLE ROW LEVEL SECURITY;

-- No policies are created. With RLS on and no policies, every non-service_role
-- request returns zero rows / is rejected. The explicit REVOKE below is
-- belt-and-suspenders against a future GRANT slipping in.
REVOKE ALL ON public.org_stripe_secrets FROM anon, authenticated, public;

CREATE INDEX IF NOT EXISTS idx_org_stripe_secrets_secret_key
  ON public.org_stripe_secrets (stripe_secret_key)
  WHERE stripe_secret_key IS NOT NULL;

CREATE TRIGGER trg_org_stripe_secrets_updated_at
  BEFORE UPDATE ON public.org_stripe_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Backfill from org_stripe_settings, then drop the secret columns
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO public.org_stripe_secrets (
  organization_id, stripe_secret_key, stripe_access_token, stripe_refresh_token, created_at, updated_at
)
SELECT
  organization_id,
  NULLIF(stripe_secret_key, ''),
  stripe_access_token,
  stripe_refresh_token,
  created_at,
  updated_at
FROM public.org_stripe_settings
WHERE
  NULLIF(stripe_secret_key, '') IS NOT NULL
  OR stripe_access_token IS NOT NULL
  OR stripe_refresh_token IS NOT NULL
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE public.org_stripe_settings DROP COLUMN IF EXISTS stripe_secret_key;
ALTER TABLE public.org_stripe_settings DROP COLUMN IF EXISTS stripe_access_token;
ALTER TABLE public.org_stripe_settings DROP COLUMN IF EXISTS stripe_refresh_token;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. security_audit_log — append-only record of secret-key access
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  organization_id UUID,
  actor_role TEXT,
  actor_user_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_org
  ON public.security_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_event
  ON public.security_audit_log (event_type, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Owners can read their own org's audit log. No INSERT/UPDATE/DELETE policy
-- for any non-service-role: writes happen only through SECURITY DEFINER
-- functions or directly from service_role.
CREATE POLICY "Owners can read own org security audit log"
  ON public.security_audit_log
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.organization_id = security_audit_log.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.security_audit_log FROM anon, authenticated, public;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. SECURITY DEFINER access functions
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_org_stripe_secret(p_org_id UUID)
RETURNS TABLE (
  stripe_secret_key TEXT,
  stripe_access_token TEXT,
  stripe_refresh_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := current_setting('request.jwt.claims', true)::jsonb->>'role';
BEGIN
  -- This function runs SECURITY DEFINER so anyone with EXECUTE can call it.
  -- We restrict EXECUTE to service_role below — anon/authenticated cannot
  -- invoke it at all. The audit row records who triggered the read so we
  -- have a paper trail even for legitimate service_role calls.
  INSERT INTO public.security_audit_log (event_type, organization_id, actor_role, actor_user_id, details)
  VALUES (
    'stripe_secret_read',
    p_org_id,
    COALESCE(v_role, 'service_role'),
    auth.uid(),
    jsonb_build_object('source', 'get_org_stripe_secret')
  );

  RETURN QUERY
    SELECT s.stripe_secret_key, s.stripe_access_token, s.stripe_refresh_token
    FROM public.org_stripe_secrets s
    WHERE s.organization_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_stripe_secret(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_stripe_secret(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.find_org_by_stripe_secret(p_secret_key TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.org_stripe_secrets
  WHERE stripe_secret_key = p_secret_key
  LIMIT 1;

  INSERT INTO public.security_audit_log (event_type, organization_id, actor_role, details)
  VALUES (
    'stripe_secret_lookup',
    v_org_id,
    COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'service_role'),
    jsonb_build_object('source', 'find_org_by_stripe_secret', 'matched', v_org_id IS NOT NULL)
  );

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.find_org_by_stripe_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_org_by_stripe_secret(TEXT) TO service_role;

-- The legacy stripe_duplicate_accounts function lives on org_stripe_settings
-- and only touches stripe_account_id (not a secret), so it is unaffected.
