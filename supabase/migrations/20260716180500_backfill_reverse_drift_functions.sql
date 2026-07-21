-- Backfills 5 of the 6 reverse-drift functions found during the 2026-07-15
-- migration-drift audit, plus the 4 user_roles platform-admin policies
-- from the same audit. Dumped verbatim via pg_get_functiondef/pg_policies
-- against the live database, reproduced exactly. Purely defensive.
--
-- get_client_portal_bookings (the 6th function) is deliberately excluded
-- here — its access model was actively being rewritten as of tonight
-- (commits f9b328ac/91fcee95: it and 9 sibling functions had zero
-- ownership check and PUBLIC execute grants, a live unauthenticated PII
-- exposure) and will get its own migration once that fix's revoke step
-- is confirmed and applied, so this backfill doesn't re-enshrine a grant
-- state that's already superseded.
--
-- KNOWN GAP: email_queue_wake() and validate_subscription_fields() are
-- trigger functions (RETURNS trigger), but the actual CREATE TRIGGER
-- statements attaching them to their tables were never captured — a
-- follow-up query to find them (searches all schemas, since
-- email_queue_wake is likely on a pgmq.* queue table) was written but
-- never run. Their function bodies below are complete and correct, but
-- on a full rebuild from migrations alone, both would exist disconnected
-- — new emails wouldn't wake the dispatcher, subscription field
-- validation wouldn't fire. Needs a follow-up pass.

-- ============================================================================
-- is_client_portal_user — ownership-check helper, safe as designed
-- (explicit uuid args, not implicit auth.uid() trust by itself; used to
-- verify a client_portal_users row belongs to a given auth user)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_client_portal_user(_user_id uuid, _client_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    JOIN public.customers c ON c.id = cpu.customer_id
    WHERE cpu.id = _client_user_id
      AND c.user_id = _user_id
  )
$function$;

REVOKE ALL ON FUNCTION public.is_client_portal_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_client_portal_user(uuid, uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- get_org_stripe_public_settings — SECURITY DEFINER granted to PUBLIC,
-- but correctly self-checks is_org_admin(p_org_id) inside — the pattern
-- get_client_portal_bookings should have followed and didn't.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_org_stripe_public_settings(p_org_id uuid)
 RETURNS TABLE(organization_id uuid, is_connected boolean, stripe_account_id text, stripe_publishable_key text, stripe_user_email text, stripe_display_name text, stripe_payouts_enabled boolean, stripe_default_currency text, connected_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    oss.organization_id,
    oss.is_connected,
    oss.stripe_account_id,
    oss.stripe_publishable_key,
    oss.stripe_user_email,
    oss.stripe_display_name,
    oss.stripe_payouts_enabled,
    oss.stripe_default_currency,
    oss.connected_at
  FROM public.org_stripe_settings oss
  WHERE oss.organization_id = p_org_id
    AND public.is_org_admin(p_org_id)
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_org_stripe_public_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_stripe_public_settings(uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- email_queue_dispatch / email_queue_wake — self-arming/disarming pg_cron
-- dispatcher pair for the pgmq-backed email queue. NOT granted to PUBIC
-- live (only a platform-managed sandbox_exec role, left untouched here —
-- not part of this app's normal anon/authenticated/service_role model
-- and not something this migration should guess at modifying).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://slwfkaqczvwvvvavkgpr.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM PUBLIC;

-- KNOWN GAP (see header): trigger attachment not captured.
CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://slwfkaqczvwvvvavkgpr.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.email_queue_wake() FROM PUBLIC;

-- ============================================================================
-- validate_subscription_fields — trigger function, CHECK-style validation.
-- KNOWN GAP (see header): trigger attachment not captured (likely on
-- organizations or stripe_subscriptions, unconfirmed).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_subscription_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.subscription_tier NOT IN ('starter', 'pro', 'business') THEN
    RAISE EXCEPTION 'Invalid subscription_tier: %', NEW.subscription_tier;
  END IF;
  IF NEW.subscription_status NOT IN ('trial', 'active', 'cancelled', 'past_due') THEN
    RAISE EXCEPTION 'Invalid subscription_status: %', NEW.subscription_status;
  END IF;
  IF NEW.billing_cycle IS NOT NULL AND NEW.billing_cycle NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Invalid billing_cycle: %', NEW.billing_cycle;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- user_roles — 4 platform-admin policies (reverse drift). The table
-- itself and its 5th policy ("Users can view own roles", auth.uid() =
-- user_id) already have migration backing elsewhere — not touched here.
-- ============================================================================
DO $$ BEGIN
  CREATE POLICY "Platform admins can delete roles" ON public.user_roles FOR DELETE
    USING (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Platform admins can insert roles" ON public.user_roles FOR INSERT
    WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Platform admins can update roles" ON public.user_roles FOR UPDATE
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Platform admins can view all roles" ON public.user_roles FOR SELECT
    USING (public.is_platform_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
