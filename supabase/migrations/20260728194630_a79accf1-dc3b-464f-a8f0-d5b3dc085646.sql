-- 1. Columns + unique constraint
ALTER TABLE public.abandoned_bookings
  ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS form_snapshot JSONB;

ALTER TABLE public.abandoned_bookings
  ADD CONSTRAINT abandoned_bookings_session_token_key UNIQUE (session_token);

-- 2. Anonymous update scoped to own row; org + consent immutable for anon/authenticated
CREATE OR REPLACE FUNCTION public.guard_abandoned_booking_anon_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated')
     OR current_user IN ('anon', 'authenticated') THEN
    NEW.organization_id := OLD.organization_id;
    NEW.sms_consent := OLD.sms_consent;
    NEW.session_token := OLD.session_token;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_abandoned_booking_anon_update ON public.abandoned_bookings;
CREATE TRIGGER trg_guard_abandoned_booking_anon_update
  BEFORE UPDATE ON public.abandoned_bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_abandoned_booking_anon_update();

DROP POLICY IF EXISTS "Anon can update own abandoned row by session token" ON public.abandoned_bookings;
CREATE POLICY "Anon can update own abandoned row by session token"
ON public.abandoned_bookings FOR UPDATE
TO anon, authenticated
USING (session_token IS NOT NULL)
WITH CHECK (session_token IS NOT NULL);

GRANT UPDATE ON public.abandoned_bookings TO anon, authenticated;

-- 3. Insert policy must forbid self-granted consent
DROP POLICY IF EXISTS "Anyone can insert abandoned bookings with org" ON public.abandoned_bookings;
CREATE POLICY "Anyone can insert abandoned bookings with org"
ON public.abandoned_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = abandoned_bookings.organization_id)
  AND (
    (email IS NOT NULL AND length(trim(both from email)) > 0)
    OR (first_name IS NOT NULL AND length(trim(both from first_name)) > 0)
  )
  AND sms_consent = false
);

-- 4. Recovery index
CREATE INDEX IF NOT EXISTS idx_abandoned_bookings_recovery
ON public.abandoned_bookings (organization_id, sms_consent, followup_sent, converted, created_at);

-- 5. sms_suppressions
CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'sms_stop',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone)
);

GRANT SELECT ON public.sms_suppressions TO authenticated;
GRANT ALL ON public.sms_suppressions TO service_role;

ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view sms suppressions" ON public.sms_suppressions;
CREATE POLICY "Org members can view sms suppressions"
ON public.sms_suppressions FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id));

-- 6. Seed automation toggle, disabled
INSERT INTO public.organization_automations (organization_id, automation_type, is_enabled, description)
SELECT o.id, 'abandoned_booking_recovery', false,
       'Texts people who started a booking and did not finish, if they opted in'
FROM public.organizations o
ON CONFLICT (organization_id, automation_type) DO NOTHING;