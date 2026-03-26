
-- Staff payout accounts table for Stripe Connect
CREATE TABLE public.staff_payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_account_id TEXT,
  account_status TEXT NOT NULL DEFAULT 'not_started',
  payouts_enabled BOOLEAN DEFAULT false,
  charges_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  account_holder_name TEXT,
  bank_last4 TEXT,
  onboarding_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, organization_id)
);

ALTER TABLE public.staff_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Staff can view their own payout account
CREATE POLICY "Staff can view own payout account"
  ON public.staff_payout_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_payout_accounts.staff_id
        AND s.user_id = auth.uid()
    )
  );

-- Admins can view all payout accounts in their org
CREATE POLICY "Admins can view org payout accounts"
  ON public.staff_payout_accounts FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- Staff can update their own payout account
CREATE POLICY "Staff can update own payout account"
  ON public.staff_payout_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_payout_accounts.staff_id
        AND s.user_id = auth.uid()
    )
  );

-- Staff can insert their own payout account
CREATE POLICY "Staff can insert own payout account"
  ON public.staff_payout_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_payout_accounts.staff_id
        AND s.user_id = auth.uid()
    )
  );

-- Admin notifications table for staff events
CREATE TABLE public.staff_event_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_event_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view org staff notifications"
  ON public.staff_event_notifications FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Admins can update org staff notifications"
  ON public.staff_event_notifications FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "System can insert staff notifications"
  ON public.staff_event_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger to notify admin when a document is uploaded
CREATE OR REPLACE FUNCTION public.notify_admin_staff_document_upload()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_staff_name TEXT;
  v_org_id UUID;
BEGIN
  SELECT s.name, s.organization_id INTO v_staff_name, v_org_id
  FROM public.staff s WHERE s.id = NEW.staff_id;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.staff_event_notifications (organization_id, staff_id, event_type, title, message)
    VALUES (v_org_id, NEW.staff_id, 'document_uploaded',
      'New Document Uploaded',
      COALESCE(v_staff_name, 'A staff member') || ' uploaded a ' || COALESCE(NEW.document_type, 'document'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admin_staff_document
  AFTER INSERT ON public.staff_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_staff_document_upload();

-- Trigger to notify admin when a signature is submitted
CREATE OR REPLACE FUNCTION public.notify_admin_staff_signature()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_staff_name TEXT;
  v_org_id UUID;
  v_doc_title TEXT;
BEGIN
  SELECT s.name, s.organization_id INTO v_staff_name, v_org_id
  FROM public.staff s WHERE s.id = NEW.staff_id;

  SELECT title INTO v_doc_title
  FROM public.staff_signable_documents WHERE id = NEW.document_id;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.staff_event_notifications (organization_id, staff_id, event_type, title, message)
    VALUES (v_org_id, NEW.staff_id, 'document_signed',
      'Document Signed',
      COALESCE(v_staff_name, 'A staff member') || ' signed "' || COALESCE(v_doc_title, 'a document') || '"');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admin_staff_signature
  AFTER INSERT ON public.staff_signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_staff_signature();

-- Trigger to notify admin when payout account is set up
CREATE OR REPLACE FUNCTION public.notify_admin_payout_setup()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_staff_name TEXT;
BEGIN
  IF NEW.details_submitted = true AND (OLD.details_submitted IS NULL OR OLD.details_submitted = false) THEN
    SELECT s.name INTO v_staff_name
    FROM public.staff s WHERE s.id = NEW.staff_id;

    INSERT INTO public.staff_event_notifications (organization_id, staff_id, event_type, title, message)
    VALUES (NEW.organization_id, NEW.staff_id, 'payout_setup',
      'Payout Info Submitted',
      COALESCE(v_staff_name, 'A staff member') || ' completed their payout setup');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admin_payout_setup
  AFTER UPDATE ON public.staff_payout_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_payout_setup();
