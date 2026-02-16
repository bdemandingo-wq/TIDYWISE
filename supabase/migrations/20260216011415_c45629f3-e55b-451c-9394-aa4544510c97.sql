
-- Rebooking reminder queue: triggers 28 days after booking completion
CREATE TABLE public.rebooking_reminder_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  send_at TIMESTAMPTZ NOT NULL,
  deferred_until TIMESTAMPTZ, -- used when no review exists yet (defer 7 days)
  defer_count INTEGER NOT NULL DEFAULT 0,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_reason TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id) -- only one reminder per booking
);

-- Indexes
CREATE INDEX idx_rebooking_queue_pending ON public.rebooking_reminder_queue (sent, cancelled, send_at) WHERE sent = false AND cancelled = false;
CREATE INDEX idx_rebooking_queue_org ON public.rebooking_reminder_queue (organization_id);
CREATE INDEX idx_rebooking_queue_customer ON public.rebooking_reminder_queue (customer_id);

-- RLS
ALTER TABLE public.rebooking_reminder_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view rebooking reminders"
  ON public.rebooking_reminder_queue FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "Service role manages rebooking reminders"
  ON public.rebooking_reminder_queue FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger: queue rebooking reminder when booking completes
CREATE OR REPLACE FUNCTION public.queue_rebooking_reminder_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.rebooking_reminder_queue (booking_id, customer_id, organization_id, send_at)
    VALUES (NEW.id, NEW.customer_id, NEW.organization_id, now() + interval '28 days')
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_queue_rebooking_reminder
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_rebooking_reminder_on_complete();

-- Auto-cancel rebooking reminder when a new booking is created for the same customer
CREATE OR REPLACE FUNCTION public.cancel_rebooking_reminder_on_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If a new future booking is created for a customer, cancel any pending rebooking reminders
  IF NEW.customer_id IS NOT NULL AND NEW.scheduled_at > now() AND NEW.status IN ('pending', 'confirmed') THEN
    UPDATE public.rebooking_reminder_queue
    SET cancelled = true, cancelled_reason = 'Future booking created: ' || NEW.id::text
    WHERE customer_id = NEW.customer_id
      AND organization_id = NEW.organization_id
      AND sent = false
      AND cancelled = false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cancel_rebooking_on_new_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_rebooking_reminder_on_new_booking();
