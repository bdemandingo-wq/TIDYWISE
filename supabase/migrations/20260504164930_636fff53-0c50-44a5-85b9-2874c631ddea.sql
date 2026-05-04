
CREATE TABLE IF NOT EXISTS public.admin_action_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  admin_user_id uuid,
  action text NOT NULL,
  payment_intent_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_action_audit_org ON public.admin_action_audit_log(organization_id, created_at DESC);
ALTER TABLE public.admin_action_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view admin action audit"
  ON public.admin_action_audit_log FOR SELECT
  TO authenticated USING (public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.sms_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  admin_user_id uuid,
  sms_type text NOT NULL,
  customer_phone text,
  customer_email_hash text,
  status text NOT NULL DEFAULT 'sent',
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_send_log_org_time ON public.sms_send_log(organization_id, created_at DESC);
ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view sms send log"
  ON public.sms_send_log FOR SELECT
  TO authenticated USING (public.is_org_member(organization_id));
