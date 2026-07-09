
-- 1) Extend organization_email_settings
ALTER TABLE public.organization_email_settings
  ADD COLUMN IF NOT EXISTS smtp_email text,
  ADD COLUMN IF NOT EXISTS smtp_app_password text,
  ADD COLUMN IF NOT EXISTS email_send_method text NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS gmail_account_type text NOT NULL DEFAULT 'consumer';

-- Validate values via trigger (avoid CHECK on possibly-existing rows w/ null)
CREATE OR REPLACE FUNCTION public.validate_org_email_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.email_send_method NOT IN ('resend','gmail_smtp') THEN
    RAISE EXCEPTION 'email_send_method must be resend or gmail_smtp';
  END IF;
  IF NEW.gmail_account_type NOT IN ('consumer','workspace') THEN
    RAISE EXCEPTION 'gmail_account_type must be consumer or workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_org_email_settings ON public.organization_email_settings;
CREATE TRIGGER trg_validate_org_email_settings
  BEFORE INSERT OR UPDATE ON public.organization_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_org_email_settings();

-- 2) Lock down sensitive columns (never readable from frontend)
REVOKE SELECT (smtp_app_password) ON public.organization_email_settings FROM anon, authenticated;
REVOKE SELECT (resend_api_key)    ON public.organization_email_settings FROM anon, authenticated;

-- Grant explicit SELECT on non-sensitive columns to authenticated so PostgREST can serve them
GRANT SELECT (
  id, organization_id, from_name, from_email, reply_to_email, email_footer,
  smtp_email, email_send_method, gmail_account_type, created_at, updated_at
) ON public.organization_email_settings TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.organization_email_settings TO authenticated;
GRANT ALL ON public.organization_email_settings TO service_role;

-- 3) Safe accessor RPC (no secrets ever leave the DB)
CREATE OR REPLACE FUNCTION public.get_org_email_settings_safe(_organization_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  from_name text,
  from_email text,
  reply_to_email text,
  email_footer text,
  smtp_email text,
  email_send_method text,
  gmail_account_type text,
  resend_api_key_configured boolean,
  smtp_password_configured boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_admin(_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to read email settings for this organization'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.organization_id,
    s.from_name,
    s.from_email,
    s.reply_to_email,
    s.email_footer,
    s.smtp_email,
    s.email_send_method,
    s.gmail_account_type,
    (s.resend_api_key IS NOT NULL AND length(btrim(s.resend_api_key)) > 0) AS resend_api_key_configured,
    (s.smtp_app_password IS NOT NULL AND length(btrim(s.smtp_app_password)) > 0) AS smtp_password_configured,
    s.created_at,
    s.updated_at
  FROM public.organization_email_settings s
  WHERE s.organization_id = _organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_email_settings_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_email_settings_safe(uuid) TO authenticated, service_role;

-- 4) Daily send counter (per org, per day)
CREATE TABLE IF NOT EXISTS public.org_email_daily_sends (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sent_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  sent_count integer NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'gmail_smtp',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, sent_on, method)
);

GRANT SELECT ON public.org_email_daily_sends TO authenticated;
GRANT ALL    ON public.org_email_daily_sends TO service_role;

ALTER TABLE public.org_email_daily_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can read daily send counts"
  ON public.org_email_daily_sends FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- Increment helper (upsert)
CREATE OR REPLACE FUNCTION public.increment_org_email_daily_send(
  _organization_id uuid,
  _method text DEFAULT 'gmail_smtp',
  _delta integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.org_email_daily_sends (organization_id, sent_on, method, sent_count, updated_at)
  VALUES (_organization_id, (now() AT TIME ZONE 'UTC')::date, _method, _delta, now())
  ON CONFLICT (organization_id, sent_on, method)
  DO UPDATE SET
    sent_count = public.org_email_daily_sends.sent_count + EXCLUDED.sent_count,
    updated_at = now()
  RETURNING sent_count INTO new_count;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_org_email_daily_send(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_org_email_daily_send(uuid, text, integer) TO service_role;

-- 5) Failure log
CREATE TABLE IF NOT EXISTS public.org_email_send_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  method text NOT NULL,
  fell_back_to text,
  recipient text,
  subject text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_email_send_failures_org_created
  ON public.org_email_send_failures (organization_id, created_at DESC);

GRANT SELECT ON public.org_email_send_failures TO authenticated;
GRANT ALL    ON public.org_email_send_failures TO service_role;

ALTER TABLE public.org_email_send_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can read email send failures"
  ON public.org_email_send_failures FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.log_org_email_send_failure(
  _organization_id uuid,
  _method text,
  _fell_back_to text,
  _recipient text,
  _subject text,
  _error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_email_send_failures
    (organization_id, method, fell_back_to, recipient, subject, error_message)
  VALUES
    (_organization_id, _method, _fell_back_to, _recipient, _subject, _error_message);
END;
$$;

REVOKE ALL ON FUNCTION public.log_org_email_send_failure(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_org_email_send_failure(uuid, text, text, text, text, text) TO service_role;
