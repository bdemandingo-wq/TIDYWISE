-- Add 'rescheduled' value to booking_status enum
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'rescheduled';

-- Track reschedule history on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS original_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_reason TEXT;

-- Generic admin in-app notifications (system reminders etc.)
CREATE TABLE IF NOT EXISTS public.admin_system_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_system_notif_org ON public.admin_system_notifications(organization_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_system_notif_dedupe ON public.admin_system_notifications(organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.admin_system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view org system notifications"
ON public.admin_system_notifications
FOR SELECT TO authenticated
USING (public.is_org_admin(organization_id));

CREATE POLICY "Admins update org system notifications"
ON public.admin_system_notifications
FOR UPDATE TO authenticated
USING (public.is_org_admin(organization_id));

CREATE POLICY "Admins delete org system notifications"
ON public.admin_system_notifications
FOR DELETE TO authenticated
USING (public.is_org_admin(organization_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_system_notifications;