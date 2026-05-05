-- Tidy AI co-pilot — Phase 1 schema
-- Three tables backing the onboarding wizard, ambient chat, and re-engagement
-- cron. Frontend lands in Phase 2; this migration only sets up the data plane.

-- ===========================================================================
-- onboarding_progress — one row per org. Tracks which of the 6 activation
-- milestones the org has completed, plus dismiss / re-engagement state.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  milestone_1_company_info_completed_at      TIMESTAMPTZ,
  milestone_2_services_pricing_completed_at  TIMESTAMPTZ,
  milestone_3_clients_added_completed_at     TIMESTAMPTZ,
  milestone_4_staff_added_completed_at       TIMESTAMPTZ,
  milestone_5_stripe_connected_completed_at  TIMESTAMPTZ,
  milestone_6_first_booking_completed_at     TIMESTAMPTZ,
  activated_at         TIMESTAMPTZ,
  last_engagement_at   TIMESTAMPTZ,
  reengagement_count   INTEGER NOT NULL DEFAULT 0,
  reengagement_paused  BOOLEAN NOT NULL DEFAULT false,
  csv_imports_attempted INTEGER NOT NULL DEFAULT 0,
  csv_imports_succeeded INTEGER NOT NULL DEFAULT 0,
  copilot_dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Org members can read their own org's progress (wizard UI needs this).
DO $$ BEGIN
  CREATE POLICY "Org members can read onboarding progress"
    ON public.onboarding_progress FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = onboarding_progress.organization_id
          AND m.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owners/admins can update (e.g. dismissing the wizard, pausing re-engagement).
-- Edge functions running as service role bypass RLS regardless of these.
DO $$ BEGIN
  CREATE POLICY "Org owners/admins can update onboarding progress"
    ON public.onboarding_progress FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = onboarding_progress.organization_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = onboarding_progress.organization_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Keep updated_at fresh on UPDATE.
CREATE OR REPLACE FUNCTION public._touch_onboarding_progress()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_progress_touch ON public.onboarding_progress;
CREATE TRIGGER trg_onboarding_progress_touch
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public._touch_onboarding_progress();

-- ===========================================================================
-- copilot_conversations — append-only message log, per user.
-- "Private to user only" per spec — even other org admins can't read these.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.copilot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  message_role TEXT NOT NULL CHECK (message_role IN ('user', 'assistant', 'system')),
  message_content TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user_created
  ON public.copilot_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_conversations_conversation
  ON public.copilot_conversations(conversation_id, created_at);

ALTER TABLE public.copilot_conversations ENABLE ROW LEVEL SECURITY;

-- Only the user themselves can read or insert their own messages.
DO $$ BEGIN
  CREATE POLICY "Users can read their own copilot messages"
    ON public.copilot_conversations FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own copilot messages"
    ON public.copilot_conversations FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================================================
-- copilot_reengagement_log — every nudge sent (in-app, email, SMS).
-- Org admins can SELECT for their org. Backend (service role) inserts.
-- The frontend reads channel='in_app' rows to render banners.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.copilot_reengagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_reason TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms')),
  recipient TEXT,
  message_subject TEXT,
  message_body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_responded BOOLEAN NOT NULL DEFAULT false,
  response_at TIMESTAMPTZ,
  in_app_dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_copilot_reengagement_org_sent
  ON public.copilot_reengagement_log(organization_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_reengagement_user_sent
  ON public.copilot_reengagement_log(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_reengagement_in_app_active
  ON public.copilot_reengagement_log(organization_id, sent_at DESC)
  WHERE channel = 'in_app' AND in_app_dismissed_at IS NULL;

ALTER TABLE public.copilot_reengagement_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org admins can read their org's reengagement log"
    ON public.copilot_reengagement_log FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = copilot_reengagement_log.organization_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Org members can mark their own in-app banners dismissed.
DO $$ BEGIN
  CREATE POLICY "Org members can dismiss their org's in-app banners"
    ON public.copilot_reengagement_log FOR UPDATE
    USING (
      channel = 'in_app'
      AND EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = copilot_reengagement_log.organization_id
          AND m.user_id = auth.uid()
      )
    )
    WITH CHECK (
      channel = 'in_app'
      AND EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = copilot_reengagement_log.organization_id
          AND m.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
