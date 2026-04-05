
-- Create platform_notifications table for logging all platform events
CREATE TABLE public.platform_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  message_preview TEXT,
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: only platform admins can read
ALTER TABLE public.platform_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read notifications"
ON public.platform_notifications FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'support@tidywisecleaning.com'
  )
);

-- Trigger function to notify on new organization signup
CREATE OR REPLACE FUNCTION public.notify_new_org_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supabase_url TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://slwfkaqczvwvvvavkgpr.supabase.co';
  END IF;

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/notify-new-organization-signup',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'org_id', NEW.id,
      'org_name', NEW.name,
      'created_at', NEW.created_at
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'notify_new_org_signup error: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_new_org_created
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.notify_new_org_signup();
