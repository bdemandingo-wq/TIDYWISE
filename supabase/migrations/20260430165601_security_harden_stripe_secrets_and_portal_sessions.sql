-- Security hardening migration
--
-- Addresses two findings from Lovable's Supabase advisor:
-- 1. ERROR: org_stripe_settings exposes stripe_secret_key / stripe_access_token /
--    stripe_refresh_token to any user with the 'admin' or 'owner' role on the org.
--    Non-owner admins can read Stripe credentials.
-- 2. WARNING: client_portal_sessions UPDATE policy uses USING (client_user_id IS NOT NULL)
--    with no ownership check. Any anon or authenticated request can update any
--    session row that has client_user_id set.
--
-- Rationale for chosen fixes:
--
-- (1) We REVOKE column-level SELECT on the three secret columns from the anon and
--     authenticated roles instead of restricting the table-level SELECT policy to
--     owners. Reason: the only code paths that read those columns are Edge
--     Functions running with service_role (which retains full access). Client-side
--     admin UIs (HealthMonitorTab, PaymentStep, InvoiceFormDialog,
--     useOnboardingChecklist) only ever query the safe columns
--     (is_connected, connected_at, stripe_account_id), so they keep working for
--     both owner and admin roles. Tightening the table-level SELECT policy to
--     owners-only would break those admin UIs.
--
-- (2) We DROP the broken client_portal_sessions UPDATE policy and do NOT replace
--     it. Client portal users are tracked in client_portal_users (not auth.users),
--     so auth.uid() returns NULL for them and a "USING (client_user_id = auth.uid())"
--     fix doesn't apply. The proper fix is to route session updates through an
--     Edge Function with service_role that validates the client portal session
--     token. Until that Edge Function exists, dropping the policy means the
--     useClientPortalSessionTracker hook will silently fail its periodic
--     duration_seconds and is_active updates. Practical impact: session analytics
--     stay at duration_seconds=0 / is_active=true. No user-visible breakage.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. org_stripe_settings: revoke column-level SELECT on secret columns
-- ──────────────────────────────────────────────────────────────────────────────

REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon, authenticated;

-- service_role retains full table access via the default Supabase grants. Edge
-- Functions reading these columns continue to work unchanged.

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. client_portal_sessions: drop the over-permissive UPDATE policy
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own client sessions" ON public.client_portal_sessions;

-- TODO(security): build a Supabase Edge Function that validates the client
-- portal session token and performs session updates with service_role. Replace
-- the dropped policy with one that only allows service_role writes, OR keep RLS
-- closed and route all writes through the Edge Function.
