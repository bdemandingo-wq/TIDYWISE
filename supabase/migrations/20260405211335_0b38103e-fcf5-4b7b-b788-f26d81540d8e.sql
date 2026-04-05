
-- OpenPhone calls cache table
CREATE TABLE public.openphone_calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  openphone_call_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  status TEXT NOT NULL DEFAULT 'completed',
  duration INTEGER DEFAULT 0,
  caller_phone TEXT,
  caller_name TEXT,
  phone_number_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  has_recording BOOLEAN DEFAULT false,
  has_transcript BOOLEAN DEFAULT false,
  has_summary BOOLEAN DEFAULT false,
  has_voicemail BOOLEAN DEFAULT false,
  ai_summary TEXT,
  transcript JSONB,
  recording_url TEXT,
  voicemail_url TEXT,
  voicemail_transcript TEXT,
  matched_customer_id UUID REFERENCES public.customers(id),
  matched_lead_id UUID REFERENCES public.leads(id),
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, openphone_call_id)
);

-- Enable RLS
ALTER TABLE public.openphone_calls ENABLE ROW LEVEL SECURITY;

-- RLS policies: org admins can read/write
CREATE POLICY "Org admins can manage calls"
ON public.openphone_calls
FOR ALL
TO authenticated
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

-- Staff can view calls for their org
CREATE POLICY "Org staff can view calls"
ON public.openphone_calls
FOR SELECT
TO authenticated
USING (public.is_org_staff(organization_id));

-- Index for fast lookups
CREATE INDEX idx_openphone_calls_org_started ON public.openphone_calls(organization_id, started_at DESC);
CREATE INDEX idx_openphone_calls_caller ON public.openphone_calls(organization_id, caller_phone);
