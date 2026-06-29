
CREATE TABLE public.org_zapier_alert_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  failure_threshold int NOT NULL DEFAULT 5 CHECK (failure_threshold >= 1),
  window_minutes int NOT NULL DEFAULT 15 CHECK (window_minutes >= 1),
  notify_inapp boolean NOT NULL DEFAULT true,
  notify_email boolean NOT NULL DEFAULT false,
  recipient_email text,
  cooldown_minutes int NOT NULL DEFAULT 30 CHECK (cooldown_minutes >= 1),
  last_alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_zapier_alert_settings TO authenticated;
GRANT ALL ON public.org_zapier_alert_settings TO service_role;

ALTER TABLE public.org_zapier_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view zapier alert settings"
  ON public.org_zapier_alert_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins can insert zapier alert settings"
  ON public.org_zapier_alert_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Org admins can update zapier alert settings"
  ON public.org_zapier_alert_settings FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Org admins can delete zapier alert settings"
  ON public.org_zapier_alert_settings FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()));

CREATE TRIGGER update_org_zapier_alert_settings_updated_at
  BEFORE UPDATE ON public.org_zapier_alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful index for log filtering by webhook
CREATE INDEX IF NOT EXISTS idx_zapier_dispatch_log_webhook ON public.zapier_dispatch_log(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zapier_dispatch_log_org_event ON public.zapier_dispatch_log(organization_id, event_type, created_at DESC);
