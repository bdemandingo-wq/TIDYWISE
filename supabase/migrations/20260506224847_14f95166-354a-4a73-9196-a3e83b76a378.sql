DO $$ BEGIN
  ALTER TABLE public.onboarding_progress ADD COLUMN tour_completed_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.onboarding_progress ADD COLUMN tour_skipped_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.onboarding_progress
    ADD COLUMN tour_current_step INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.product_tour_events (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN ('tour_started', 'step_viewed', 'tour_completed', 'tour_skipped')),
  step_number     INTEGER,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_tour_events_org_created
  ON public.product_tour_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_tour_events_user_created
  ON public.product_tour_events(user_id, created_at DESC);

ALTER TABLE public.product_tour_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users insert their own tour events"
    ON public.product_tour_events FOR INSERT
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Org admins read tour events"
    ON public.product_tour_events FOR SELECT
    USING (
      organization_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.org_memberships m
        WHERE m.organization_id = product_tour_events.organization_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.onboarding_progress (organization_id, tour_skipped_at)
SELECT o.id, now()
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.onboarding_progress op WHERE op.organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

UPDATE public.onboarding_progress
SET tour_skipped_at = now()
WHERE tour_skipped_at IS NULL
  AND tour_completed_at IS NULL;