-- ===========================================================================
-- onboarding_progress
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
  copilot_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS copilot_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.onboarding_progress SET copilot_enabled = TRUE WHERE copilot_enabled = FALSE;

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

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

DO $$ BEGIN
  CREATE POLICY "Org owners/admins can insert onboarding progress"
    ON public.onboarding_progress FOR INSERT
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

CREATE OR REPLACE FUNCTION public._touch_onboarding_progress()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_progress_touch ON public.onboarding_progress;
CREATE TRIGGER trg_onboarding_progress_touch
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public._touch_onboarding_progress();

-- Backfill: ensure every existing organization has a row (copilot_enabled = TRUE by default)
INSERT INTO public.onboarding_progress (organization_id)
SELECT o.id FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.onboarding_progress op WHERE op.organization_id = o.id
);

-- ===========================================================================
-- copilot_conversations
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
-- copilot_reengagement_log
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

-- Realtime: stream onboarding_progress changes so toggle propagates across tabs/sessions
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_progress;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;