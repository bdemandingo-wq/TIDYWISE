
CREATE TABLE public.stripe_requirement_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requirement_type text NOT NULL, -- 'currently_due', 'past_due', 'pending_verification'
  stripe_requirement_codes text[] NOT NULL DEFAULT '{}',
  email_sent_count integer NOT NULL DEFAULT 0,
  last_emailed_at timestamptz,
  account_link_url text,
  link_expires_at timestamptz,
  resolved_at timestamptz,
  needs_manual_followup boolean NOT NULL DEFAULT false,
  email_status text NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_requirement_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view requirement notifications"
  ON public.stripe_requirement_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update requirement notifications"
  ON public.stripe_requirement_notifications
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE INDEX idx_stripe_req_notif_org ON public.stripe_requirement_notifications(organization_id);
CREATE INDEX idx_stripe_req_notif_staff ON public.stripe_requirement_notifications(staff_id);
CREATE INDEX idx_stripe_req_notif_unresolved ON public.stripe_requirement_notifications(organization_id) WHERE resolved_at IS NULL;

CREATE TRIGGER update_stripe_req_notif_updated_at
  BEFORE UPDATE ON public.stripe_requirement_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
