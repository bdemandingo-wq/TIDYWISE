
-- Queue table for automated review SMS
CREATE TABLE public.automated_review_sms_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID,
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.automated_review_sms_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their queue" ON public.automated_review_sms_queue
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE INDEX idx_review_sms_queue_pending ON public.automated_review_sms_queue (send_at) WHERE sent = false;

-- Trigger: auto-queue review SMS when booking status changes to completed
CREATE OR REPLACE FUNCTION public.queue_review_sms_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    INSERT INTO public.automated_review_sms_queue (booking_id, organization_id, customer_id, send_at)
    VALUES (NEW.id, NEW.organization_id, NEW.customer_id, now() + interval '30 minutes')
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_queue_review_sms
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_review_sms_on_complete();

-- Cron job: process queue every 5 minutes
SELECT cron.schedule(
  'process-review-sms-queue',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/process-review-sms-queue',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  )$$
);
