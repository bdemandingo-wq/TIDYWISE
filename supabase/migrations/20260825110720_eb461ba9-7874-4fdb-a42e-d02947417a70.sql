ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_send_log_org_created
  ON public.email_send_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_message_id
  ON public.email_send_log (message_id);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient
  ON public.email_send_log (recipient_email);

GRANT SELECT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;

DROP POLICY IF EXISTS "Org members can view their email send log" ON public.email_send_log;
CREATE POLICY "Org members can view their email send log"
ON public.email_send_log
FOR SELECT
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE TABLE IF NOT EXISTS public.system_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  user_id uuid,
  resource_type text,
  resource_id text,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_audit_log TO authenticated;
GRANT ALL ON public.system_audit_log TO service_role;

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view their audit log" ON public.system_audit_log;
CREATE POLICY "Org members can view their audit log"
ON public.system_audit_log
FOR SELECT
TO authenticated
USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE INDEX IF NOT EXISTS idx_system_audit_log_org_created
  ON public.system_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_log_action
  ON public.system_audit_log (action, created_at DESC);