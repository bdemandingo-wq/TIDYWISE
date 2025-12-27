-- Drop existing RLS policies for help_videos
DROP POLICY IF EXISTS "Users can view help videos in their org" ON public.help_videos;
DROP POLICY IF EXISTS "Admins can insert help videos" ON public.help_videos;
DROP POLICY IF EXISTS "Admins can update help videos" ON public.help_videos;
DROP POLICY IF EXISTS "Admins can delete help videos" ON public.help_videos;

-- Create new policies to make help videos global
-- All authenticated users can view all help videos
CREATE POLICY "Authenticated users can view all help videos"
ON public.help_videos
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only org owners can create help videos (they become global)
CREATE POLICY "Org owners can insert help videos"
ON public.help_videos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_memberships
    WHERE org_memberships.user_id = auth.uid()
    AND org_memberships.role = 'owner'
  )
);

-- Only org owners can update help videos
CREATE POLICY "Org owners can update help videos"
ON public.help_videos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM org_memberships
    WHERE org_memberships.user_id = auth.uid()
    AND org_memberships.role = 'owner'
  )
);

-- Only org owners can delete help videos
CREATE POLICY "Org owners can delete help videos"
ON public.help_videos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM org_memberships
    WHERE org_memberships.user_id = auth.uid()
    AND org_memberships.role = 'owner'
  )
);