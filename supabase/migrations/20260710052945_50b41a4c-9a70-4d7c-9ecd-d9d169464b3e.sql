
-- 1) Notification preferences table (per organization)
CREATE TABLE IF NOT EXISTS public.organization_notification_preferences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  sidebar_badges JSONB NOT NULL DEFAULT '{}'::jsonb,
  bell_notifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  channels JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_notification_preferences TO authenticated;
GRANT ALL ON public.organization_notification_preferences TO service_role;

ALTER TABLE public.organization_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view notification preferences"
  ON public.organization_notification_preferences
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = organization_notification_preferences.organization_id
      AND om.user_id = auth.uid()
  ));

CREATE POLICY "Org operators can upsert notification preferences"
  ON public.organization_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = organization_notification_preferences.organization_id
      AND om.user_id = auth.uid()
      AND om.role = ANY (ARRAY['owner','admin','manager'])
  ));

CREATE POLICY "Org operators can update notification preferences"
  ON public.organization_notification_preferences
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = organization_notification_preferences.organization_id
      AND om.user_id = auth.uid()
      AND om.role = ANY (ARRAY['owner','admin','manager'])
  ));

CREATE TRIGGER update_org_notif_prefs_updated_at
  BEFORE UPDATE ON public.organization_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Restrict Stripe settings SELECT to owner/admin (drop manager read access to secret keys)
DROP POLICY IF EXISTS "Org operators can view their org Stripe settings" ON public.org_stripe_settings;

CREATE POLICY "Owners and admins can view their org Stripe settings"
  ON public.org_stripe_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = org_stripe_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role = ANY (ARRAY['owner','admin'])
  ));
