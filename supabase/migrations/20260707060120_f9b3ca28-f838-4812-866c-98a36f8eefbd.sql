
-- automation_definitions
CREATE TABLE public.automation_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_key text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, automation_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_definitions TO authenticated;
GRANT ALL ON public.automation_definitions TO service_role;
ALTER TABLE public.automation_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view automation_definitions"
  ON public.automation_definitions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_definitions.organization_id AND m.user_id = auth.uid()));
CREATE POLICY "org admins manage automation_definitions"
  ON public.automation_definitions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_definitions.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_definitions.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

-- automation_triggers
CREATE TABLE public.automation_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_definitions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_key text NOT NULL,
  offset_value integer,
  offset_unit text CHECK (offset_unit IN ('minutes','hours','days')),
  direction text CHECK (direction IN ('before','after','immediate')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.automation_triggers (automation_id);
CREATE INDEX ON public.automation_triggers (organization_id, trigger_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_triggers TO authenticated;
GRANT ALL ON public.automation_triggers TO service_role;
ALTER TABLE public.automation_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view automation_triggers"
  ON public.automation_triggers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_triggers.organization_id AND m.user_id = auth.uid()));
CREATE POLICY "org admins manage automation_triggers"
  ON public.automation_triggers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_triggers.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_triggers.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

-- automation_steps
CREATE TABLE public.automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automation_definitions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  offset_value integer NOT NULL DEFAULT 0,
  offset_unit text NOT NULL DEFAULT 'hours' CHECK (offset_unit IN ('minutes','hours','days')),
  direction text NOT NULL DEFAULT 'after' CHECK (direction IN ('before','after','immediate')),
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms','email','both')),
  recipient_client boolean NOT NULL DEFAULT true,
  recipient_cleaner boolean NOT NULL DEFAULT false,
  recipient_owner boolean NOT NULL DEFAULT false,
  sms_body text NOT NULL DEFAULT '',
  email_subject text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  offset_minutes integer GENERATED ALWAYS AS (
    CASE
      WHEN direction = 'immediate' THEN 0
      WHEN offset_unit = 'minutes' THEN offset_value
      WHEN offset_unit = 'hours'   THEN offset_value * 60
      WHEN offset_unit = 'days'    THEN offset_value * 1440
      ELSE 0
    END *
    CASE WHEN direction = 'before' THEN -1 ELSE 1 END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.automation_steps (automation_id, position);
CREATE INDEX ON public.automation_steps (organization_id, enabled, channel, offset_minutes);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_steps TO authenticated;
GRANT ALL ON public.automation_steps TO service_role;
ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members view automation_steps"
  ON public.automation_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_steps.organization_id AND m.user_id = auth.uid()));
CREATE POLICY "org admins manage automation_steps"
  ON public.automation_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_steps.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_memberships m WHERE m.organization_id = automation_steps.organization_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

-- updated_at trigger reuse
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_automation_definitions_updated BEFORE UPDATE ON public.automation_definitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_automation_steps_updated BEFORE UPDATE ON public.automation_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Conflict prevention: for each enabled step in an enabled automation, block duplicate
-- (organization, trigger_key, channel, recipient, offset_minutes) tuples.
-- We use a trigger because recipient is multi-column and channel 'both' expands to sms+email.
CREATE OR REPLACE FUNCTION public.automation_step_conflict_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_channels text[];
  v_recipients text[];
  v_conflict record;
BEGIN
  IF NOT NEW.enabled THEN RETURN NEW; END IF;
  SELECT organization_id INTO v_org FROM public.automation_definitions WHERE id = NEW.automation_id AND enabled = true;
  IF v_org IS NULL THEN RETURN NEW; END IF;

  v_channels := CASE WHEN NEW.channel = 'both' THEN ARRAY['sms','email'] ELSE ARRAY[NEW.channel] END;
  v_recipients := ARRAY(SELECT r FROM unnest(ARRAY[
    CASE WHEN NEW.recipient_client  THEN 'client'  END,
    CASE WHEN NEW.recipient_cleaner THEN 'cleaner' END,
    CASE WHEN NEW.recipient_owner   THEN 'owner'   END
  ]) r WHERE r IS NOT NULL);

  SELECT ad.name AS automation_name, s.label AS step_label, s.channel, s.offset_minutes
    INTO v_conflict
  FROM public.automation_steps s
  JOIN public.automation_definitions ad ON ad.id = s.automation_id
  JOIN public.automation_triggers t_new ON t_new.automation_id = NEW.automation_id
  JOIN public.automation_triggers t_ex  ON t_ex.automation_id = s.automation_id AND t_ex.trigger_key = t_new.trigger_key
  WHERE s.id <> NEW.id
    AND s.organization_id = NEW.organization_id
    AND s.enabled = true
    AND ad.enabled = true
    AND s.offset_minutes = NEW.offset_minutes
    AND (
      (s.channel = 'both' AND NEW.channel IN ('sms','email','both'))
      OR (NEW.channel = 'both' AND s.channel IN ('sms','email','both'))
      OR s.channel = NEW.channel
    )
    AND (
      (s.recipient_client  AND NEW.recipient_client)
      OR (s.recipient_cleaner AND NEW.recipient_cleaner)
      OR (s.recipient_owner   AND NEW.recipient_owner)
    )
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'AUTOMATION_CONFLICT: Step "%" collides with existing "% → %" (% at % min). Change the timing, channel, or recipient.',
      NEW.label, v_conflict.automation_name, v_conflict.step_label, v_conflict.channel, v_conflict.offset_minutes;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_automation_step_conflict
  BEFORE INSERT OR UPDATE ON public.automation_steps
  FOR EACH ROW EXECUTE FUNCTION public.automation_step_conflict_check();
