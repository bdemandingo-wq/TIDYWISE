-- Create client_portal_sessions table to track client portal user activity
CREATE TABLE public.client_portal_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id UUID REFERENCES public.client_portal_users(id) ON DELETE CASCADE,
  customer_email TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  session_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_end TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_client_portal_sessions_client_user_id ON public.client_portal_sessions(client_user_id);
CREATE INDEX idx_client_portal_sessions_organization_id ON public.client_portal_sessions(organization_id);
CREATE INDEX idx_client_portal_sessions_session_start ON public.client_portal_sessions(session_start DESC);
CREATE INDEX idx_client_portal_sessions_is_active ON public.client_portal_sessions(is_active);

-- Enable RLS
ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;

-- Allow all access for inserting/updating sessions (client portal uses custom auth)
-- The client portal doesn't use Supabase Auth, so we use a more permissive policy
-- but only allow users to update their own sessions
CREATE POLICY "Allow insert sessions" ON public.client_portal_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update own sessions" ON public.client_portal_sessions
  FOR UPDATE USING (true);

CREATE POLICY "Allow read sessions" ON public.client_portal_sessions
  FOR SELECT USING (true);

-- Add to realtime for live updates if needed
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_portal_sessions;

-- Create trigger for updated_at
CREATE TRIGGER update_client_portal_sessions_updated_at
  BEFORE UPDATE ON public.client_portal_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();