-- Create help_videos table for storing Loom tutorial videos
CREATE TABLE public.help_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  loom_url TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.help_videos ENABLE ROW LEVEL SECURITY;

-- RLS policies for help_videos
CREATE POLICY "Users can view help videos in their org"
  ON public.help_videos FOR SELECT
  USING (organization_id IN (SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can insert help videos"
  ON public.help_videos FOR INSERT
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "Admins can update help videos"
  ON public.help_videos FOR UPDATE
  USING (organization_id IN (SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "Admins can delete help videos"
  ON public.help_videos FOR DELETE
  USING (organization_id IN (SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid() AND role = 'owner'));

-- Trigger for updated_at
CREATE TRIGGER update_help_videos_updated_at
  BEFORE UPDATE ON public.help_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();