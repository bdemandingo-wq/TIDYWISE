
-- Queue table for recurring service offers (one per CUSTOMER, not per booking)
CREATE TABLE public.recurring_offer_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  customer_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_reason TEXT,
  defer_count INTEGER NOT NULL DEFAULT 0,
  deferred_until TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recurring_offer_queue_customer_org_unique UNIQUE (customer_id, organization_id)
);

-- Index for processing
CREATE INDEX idx_recurring_offer_queue_pending 
  ON public.recurring_offer_queue (sent, cancelled, send_at) 
  WHERE sent = false AND cancelled = false;

-- Enable RLS
ALTER TABLE public.recurring_offer_queue ENABLE ROW LEVEL SECURITY;

-- Admin access policy
CREATE POLICY "Org members can manage recurring offer queue"
  ON public.recurring_offer_queue
  FOR ALL
  USING (public.is_org_member(organization_id));

-- Trigger: Queue recurring offer on booking completion (only if customer not already queued)
CREATE OR REPLACE FUNCTION public.queue_recurring_offer_on_complete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    -- Only insert if customer doesn't already have recurring service
    IF NOT EXISTS (
      SELECT 1 FROM public.recurring_bookings
      WHERE customer_id = NEW.customer_id AND is_active = true
    ) THEN
      -- Use ON CONFLICT to ensure once-per-customer-per-org
      INSERT INTO public.recurring_offer_queue (booking_id, customer_id, organization_id, send_at)
      VALUES (NEW.id, NEW.customer_id, NEW.organization_id, now() + interval '2 hours')
      ON CONFLICT (customer_id, organization_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_queue_recurring_offer_on_complete
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_recurring_offer_on_complete();

-- Trigger: Cancel pending offer if customer activates recurring service
CREATE OR REPLACE FUNCTION public.cancel_recurring_offer_on_recurring_booked()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.recurring_offer_queue
    SET cancelled = true, cancelled_reason = 'Recurring service activated'
    WHERE customer_id = NEW.customer_id
      AND organization_id = NEW.organization_id
      AND sent = false
      AND cancelled = false;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_cancel_recurring_offer_on_recurring
  AFTER INSERT OR UPDATE ON public.recurring_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_recurring_offer_on_recurring_booked();
