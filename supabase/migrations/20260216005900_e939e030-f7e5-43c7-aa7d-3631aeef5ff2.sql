
-- Track sent booking reminders to prevent duplicates
CREATE TABLE public.booking_reminder_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- 'client_24h', 'cleaner_24h'
  recipient_phone TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(booking_id, reminder_type)
);

-- Enable RLS
ALTER TABLE public.booking_reminder_log ENABLE ROW LEVEL SECURITY;

-- Only org members can view
CREATE POLICY "Org members can view reminder logs"
ON public.booking_reminder_log
FOR SELECT
USING (public.is_org_member(organization_id));

-- Index for fast lookups
CREATE INDEX idx_booking_reminder_log_booking ON public.booking_reminder_log(booking_id, reminder_type);
CREATE INDEX idx_booking_reminder_log_org ON public.booking_reminder_log(organization_id);
