
-- Attribution columns on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_referral_code ON public.bookings(referral_code) WHERE referral_code IS NOT NULL;

-- Expand referrals.status check to include 'converted'
DO $$
DECLARE con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.referrals'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.referrals DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('pending', 'signed_up', 'converted', 'completed', 'expired'));

-- Attribution + reward + notification trigger
CREATE OR REPLACE FUNCTION public.process_booking_referral_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref RECORD;
  v_referrer RECORD;
  v_referred_name TEXT;
  v_portal_user_id UUID;
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    RETURN NEW;
  END IF;

  -- Resolve a pending referral for this org by code
  SELECT r.*
  INTO v_ref
  FROM public.referrals r
  WHERE r.referral_code = NEW.referral_code
    AND r.organization_id = NEW.organization_id
    AND r.status = 'pending'
    AND (r.referrer_customer_id IS NULL OR r.referrer_customer_id <> NEW.customer_id)
  LIMIT 1;

  IF v_ref.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Link the booking to the referral
  NEW.referral_id := v_ref.id;

  -- Attribution + reward in one atomic update
  UPDATE public.referrals
    SET referred_customer_id = NEW.customer_id,
        status = 'completed',
        credit_awarded = true,
        completed_at = now(),
        updated_at = now()
    WHERE id = v_ref.id;

  -- Credit the referrer
  IF v_ref.referrer_customer_id IS NOT NULL AND COALESCE(v_ref.credit_amount, 0) > 0 THEN
    UPDATE public.customers
      SET credits = COALESCE(credits, 0) + v_ref.credit_amount
      WHERE id = v_ref.referrer_customer_id;
  END IF;

  -- Load referrer details for notification copy
  SELECT first_name, last_name, email
  INTO v_referrer
  FROM public.customers
  WHERE id = v_ref.referrer_customer_id;

  v_referred_name := COALESCE(NULLIF(btrim(v_ref.referred_name), ''), v_ref.referred_email);

  -- Admin/owner in-app notification
  BEGIN
    INSERT INTO public.admin_system_notifications (
      organization_id, type, title, message, link, metadata, dedupe_key
    ) VALUES (
      NEW.organization_id,
      'referral_converted',
      'Referral converted',
      COALESCE(TRIM(BOTH ' ' FROM COALESCE(v_referrer.first_name,'') || ' ' || COALESCE(v_referrer.last_name,'')), 'A client')
        || '''s referral ' || v_referred_name
        || ' booked — $' || COALESCE(v_ref.credit_amount, 0)::text || ' credit applied',
      '/admin/customers',
      jsonb_build_object(
        'referral_id', v_ref.id,
        'booking_id', NEW.id,
        'referrer_customer_id', v_ref.referrer_customer_id,
        'referred_customer_id', NEW.customer_id,
        'credit_amount', v_ref.credit_amount
      ),
      'referral_converted:' || v_ref.id::text
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Portal alert for the referring client (if they have a portal login)
  SELECT id INTO v_portal_user_id
  FROM public.client_portal_users
  WHERE customer_id = v_ref.referrer_customer_id
    AND is_active = true
  LIMIT 1;

  IF v_portal_user_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.client_notifications (
        client_user_id, organization_id, title, message, type
      ) VALUES (
        v_portal_user_id,
        NEW.organization_id,
        'You earned a $' || COALESCE(v_ref.credit_amount, 0)::text || ' credit!',
        v_referred_name || ' just booked their first cleaning. Your $'
          || COALESCE(v_ref.credit_amount, 0)::text
          || ' referral credit has been added to your account.',
        'success'
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_booking_referral_attribution ON public.bookings;
CREATE TRIGGER trg_process_booking_referral_attribution
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.referral_code IS NOT NULL)
  EXECUTE FUNCTION public.process_booking_referral_attribution();
