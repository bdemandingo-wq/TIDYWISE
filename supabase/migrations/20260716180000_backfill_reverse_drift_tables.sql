-- Backfills 10 tables that exist live with zero backing anywhere in
-- supabase/migrations/ — reverse drift found during the 2026-07-15
-- migration-drift audit. Dumped verbatim from the live database via
-- pg_catalog/information_schema (exact column types, constraint defs,
-- index defs, and RLS policy text — not reconstructed from guesswork)
-- and reproduced here exactly as they exist today. This is purely
-- defensive: a rebuild from supabase/migrations/ alone would currently
-- silently drop the entire client portal, custom automations, and
-- payroll audit log. All statements are idempotent and must be a
-- no-op against the current live database.
--
-- Ordered to satisfy foreign-key dependencies between these 10 tables
-- (client_portal_users first since 3 others reference it; custom_
-- automations before its own steps/logs children).
--
-- Excluded from this backfill: get_client_portal_bookings and the
-- rest of the client-portal RPC family's access-control migration —
-- that's mid-fix as of tonight (commits f9b328ac/91fcee95) and will
-- be captured in its own migration once the revoke is confirmed and
-- applied, so this backfill doesn't re-enshrine a state that's
-- already being superseded.
--
-- Three things reproduced as-is despite looking wrong — flagged here
-- and logged as separate follow-ups, NOT corrected in this migration:
--   1. custom_automation_logs' only policy is named "Org members can
--      view automation logs" but is actually FOR ALL (full insert/
--      update/delete), not SELECT-only — any org member can currently
--      tamper with automation audit logs directly, not just read them.
--   2. client_booking_requests and payroll_audit_log each have
--      overlapping ALL policies (an older inline role-check alongside
--      a newer is_org_operator()/has_org_financial_access() helper-
--      based one) — redundant, not a security hole (permissive
--      policies OR together), likely leftover from the role-system
--      refactor.
--   3. client_portal_feedback: admins can only SELECT feedback, never
--      moderate/delete it — only the client themselves can via their
--      own "manage own" ALL policy. May be intentional (protects
--      review integrity) or an oversight.

-- ============================================================================
-- 1. client_portal_users — no reverse-drift dependencies, create first
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  must_change_password boolean DEFAULT true,
  is_active boolean DEFAULT true,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  organization_id uuid
);

DO $$ BEGIN
  ALTER TABLE public.client_portal_users
    ADD CONSTRAINT client_portal_users_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_users
    ADD CONSTRAINT client_portal_users_customer_id_key UNIQUE (customer_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_users
    ADD CONSTRAINT client_portal_users_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_users
    ADD CONSTRAINT client_portal_users_username_key UNIQUE (username);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_portal_users_customer ON public.client_portal_users(customer_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_users_org ON public.client_portal_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_users_username ON public.client_portal_users(username);

ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage client portal users" ON public.client_portal_users FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = client_portal_users.organization_id
        AND om.role = ANY (ARRAY['admin'::text, 'owner'::text])
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_client_portal_users_updated_at
    BEFORE UPDATE ON public.client_portal_users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. client_booking_requests — depends on client_portal_users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_booking_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  service_id uuid,
  requested_date timestamp with time zone NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending'::text,
  admin_response_note text,
  responded_at timestamp with time zone,
  responded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  location_id uuid
);

DO $$ BEGIN
  ALTER TABLE public.client_booking_requests
    ADD CONSTRAINT client_booking_requests_client_user_id_fkey
    FOREIGN KEY (client_user_id) REFERENCES public.client_portal_users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_booking_requests
    ADD CONSTRAINT client_booking_requests_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_booking_requests
    ADD CONSTRAINT client_booking_requests_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_booking_requests
    ADD CONSTRAINT client_booking_requests_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_booking_requests
    ADD CONSTRAINT client_booking_requests_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_booking_requests
    ADD CONSTRAINT client_booking_requests_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_booking_requests_org ON public.client_booking_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_booking_requests_status ON public.client_booking_requests(status);

ALTER TABLE public.client_booking_requests ENABLE ROW LEVEL SECURITY;

-- Flagged in header: overlaps with "Managers full ops access" below.
-- Reproduced as-is.
DO $$ BEGIN
  CREATE POLICY "Admins can manage booking requests" ON public.client_booking_requests FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = client_booking_requests.organization_id
        AND om.role = ANY (ARRAY['admin'::text, 'owner'::text])
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can create own requests" ON public.client_booking_requests FOR INSERT
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = client_booking_requests.customer_id AND c.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can view own requests" ON public.client_booking_requests FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = client_booking_requests.customer_id AND c.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Managers full ops access" ON public.client_booking_requests FOR ALL
    USING (public.is_org_operator(organization_id))
    WITH CHECK (public.is_org_operator(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_client_booking_requests_updated_at
    BEFORE UPDATE ON public.client_booking_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: on_new_booking_request_notify (AFTER INSERT -> notify_admin_new_
-- booking_request()) is NOT recreated here — confirmed already backed by
-- 20260203034341_eb4db60c-67a4-4a09-a060-cebd8c0bdf54.sql, hardened
-- further by 20260501010000_lockdown_security_definer_execute.sql.

-- ============================================================================
-- 3. client_notifications — depends on client_portal_users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info'::text,
  is_read boolean DEFAULT false,
  related_request_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.client_notifications
    ADD CONSTRAINT client_notifications_client_user_id_fkey
    FOREIGN KEY (client_user_id) REFERENCES public.client_portal_users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_notifications
    ADD CONSTRAINT client_notifications_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_notifications_user ON public.client_notifications(client_user_id);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage client notifications" ON public.client_notifications FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = client_notifications.organization_id
        AND om.role = ANY (ARRAY['admin'::text, 'owner'::text])
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can update own notifications" ON public.client_notifications FOR UPDATE
    USING (EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      JOIN public.customers c ON c.id = cpu.customer_id
      WHERE cpu.id = client_notifications.client_user_id AND c.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can view own notifications" ON public.client_notifications FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM public.client_portal_users cpu
      JOIN public.customers c ON c.id = cpu.customer_id
      WHERE cpu.id = client_notifications.client_user_id AND c.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 4. client_portal_feedback — depends on client_portal_users
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_portal_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  booking_id uuid,
  organization_id uuid NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.client_portal_feedback
    ADD CONSTRAINT client_portal_feedback_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_feedback
    ADD CONSTRAINT client_portal_feedback_client_user_id_fkey
    FOREIGN KEY (client_user_id) REFERENCES public.client_portal_users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_feedback
    ADD CONSTRAINT client_portal_feedback_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_feedback
    ADD CONSTRAINT client_portal_feedback_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_feedback
    ADD CONSTRAINT client_portal_feedback_rating_check
    CHECK ((rating >= 1) AND (rating <= 5));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_client_portal_feedback_booking ON public.client_portal_feedback(booking_id);
CREATE INDEX IF NOT EXISTS idx_client_portal_feedback_org ON public.client_portal_feedback(organization_id);

ALTER TABLE public.client_portal_feedback ENABLE ROW LEVEL SECURITY;

-- Flagged in header: admins can only SELECT, never moderate/delete. As-is.
DO $$ BEGIN
  CREATE POLICY "Admins can view all portal feedback" ON public.client_portal_feedback FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = client_portal_feedback.organization_id
        AND om.role = ANY (ARRAY['admin'::text, 'owner'::text])
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Clients can manage own portal feedback" ON public.client_portal_feedback FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = client_portal_feedback.customer_id AND c.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 5. admin_booking_request_notifications — depends on client_booking_requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_booking_request_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  booking_request_id uuid NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.admin_booking_request_notifications
    ADD CONSTRAINT admin_booking_request_notifications_booking_request_id_fkey
    FOREIGN KEY (booking_request_id) REFERENCES public.client_booking_requests(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.admin_booking_request_notifications
    ADD CONSTRAINT admin_booking_request_notifications_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_admin_booking_request_notifications_org ON public.admin_booking_request_notifications(organization_id);

ALTER TABLE public.admin_booking_request_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage request notifications" ON public.admin_booking_request_notifications FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = admin_booking_request_notifications.organization_id
        AND om.role = ANY (ARRAY['admin'::text, 'owner'::text])
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 6. client_tier_settings — depends only on organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_tier_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  tier_name text NOT NULL,
  tier_order integer NOT NULL DEFAULT 0,
  min_spending numeric NOT NULL DEFAULT 0,
  max_spending numeric,
  color text DEFAULT '#3b82f6'::text,
  benefits jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.client_tier_settings
    ADD CONSTRAINT client_tier_settings_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.client_tier_settings
    ADD CONSTRAINT client_tier_settings_organization_id_tier_name_key
    UNIQUE (organization_id, tier_name);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.client_tier_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admins can manage tier settings" ON public.client_tier_settings FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.org_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = client_tier_settings.organization_id
        AND om.role = ANY (ARRAY['admin'::text, 'owner'::text])
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org members can view tier settings" ON public.client_tier_settings FOR SELECT
    USING (public.is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER update_client_tier_settings_updated_at
    BEFORE UPDATE ON public.client_tier_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 7. custom_automations — depends only on organizations, create before
--    its own steps/logs children below
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.custom_automations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  trigger_type text NOT NULL,
  tag_filter text,
  is_active boolean DEFAULT true,
  overrides_default text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.custom_automations
    ADD CONSTRAINT custom_automations_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_custom_automations_org ON public.custom_automations(organization_id);

ALTER TABLE public.custom_automations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org members can manage custom automations" ON public.custom_automations FOR ALL
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: no updated_at trigger exists live for this table despite the
-- column — confirmed via the live trigger dump, not an omission here.

-- ============================================================================
-- 8. custom_automation_steps — depends on custom_automations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.custom_automation_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid NOT NULL,
  step_order integer NOT NULL DEFAULT 1,
  delay_value integer NOT NULL DEFAULT 0,
  delay_unit text NOT NULL DEFAULT 'min'::text,
  condition text NOT NULL DEFAULT 'always'::text,
  message_body text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.custom_automation_steps
    ADD CONSTRAINT custom_automation_steps_automation_id_fkey
    FOREIGN KEY (automation_id) REFERENCES public.custom_automations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_custom_automation_steps_automation ON public.custom_automation_steps(automation_id);

ALTER TABLE public.custom_automation_steps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Steps follow parent automation access" ON public.custom_automation_steps FOR ALL
    USING (EXISTS (
      SELECT 1 FROM public.custom_automations ca
      WHERE ca.id = custom_automation_steps.automation_id AND public.is_org_member(ca.organization_id)
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.custom_automations ca
      WHERE ca.id = custom_automation_steps.automation_id AND public.is_org_member(ca.organization_id)
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 9. custom_automation_logs — depends on custom_automations + steps
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.custom_automation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_id uuid NOT NULL,
  step_id uuid,
  organization_id uuid NOT NULL,
  customer_id uuid,
  booking_id uuid,
  status text NOT NULL DEFAULT 'pending'::text,
  sent_at timestamp with time zone,
  scheduled_for timestamp with time zone,
  error text,
  paused_reason text,
  created_at timestamp with time zone DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.custom_automation_logs
    ADD CONSTRAINT custom_automation_logs_automation_id_fkey
    FOREIGN KEY (automation_id) REFERENCES public.custom_automations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.custom_automation_logs
    ADD CONSTRAINT custom_automation_logs_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.custom_automation_logs
    ADD CONSTRAINT custom_automation_logs_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.custom_automation_logs
    ADD CONSTRAINT custom_automation_logs_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.custom_automation_logs
    ADD CONSTRAINT custom_automation_logs_step_id_fkey
    FOREIGN KEY (step_id) REFERENCES public.custom_automation_steps(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_custom_automation_logs_automation ON public.custom_automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_custom_automation_logs_org ON public.custom_automation_logs(organization_id);

ALTER TABLE public.custom_automation_logs ENABLE ROW LEVEL SECURITY;

-- FLAGGED in header (#1): named "view" but is actually FOR ALL — any org
-- member can currently insert/update/delete automation logs directly,
-- not just read them. Reproduced exactly as it exists live.
DO $$ BEGIN
  CREATE POLICY "Org members can view automation logs" ON public.custom_automation_logs FOR ALL
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 10. payroll_audit_log — depends only on organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payroll_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  affected_booking_ids uuid[] DEFAULT '{}'::uuid[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.payroll_audit_log
    ADD CONSTRAINT payroll_audit_log_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_audit_log_org ON public.payroll_audit_log(organization_id);

ALTER TABLE public.payroll_audit_log ENABLE ROW LEVEL SECURITY;

-- Flagged in header (#2): overlaps with the two narrower policies below.
DO $$ BEGIN
  CREATE POLICY "Financial: owner+admin only" ON public.payroll_audit_log FOR ALL
    USING (public.has_org_financial_access(organization_id))
    WITH CHECK (public.has_org_financial_access(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org admins can insert payroll audit logs" ON public.payroll_audit_log FOR INSERT
    WITH CHECK (public.is_org_admin(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Org admins can view payroll audit logs" ON public.payroll_audit_log FOR SELECT
    USING (public.is_org_admin(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
