-- Create booking_team_assignments table for team bookings
CREATE TABLE public.booking_team_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  pay_share NUMERIC DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(booking_id, staff_id)
);

-- Enable RLS
ALTER TABLE public.booking_team_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization isolation
CREATE POLICY "Org members can view team assignments"
ON public.booking_team_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.org_memberships om ON om.organization_id = b.organization_id
    WHERE b.id = booking_team_assignments.booking_id
    AND om.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view their own team assignments"
ON public.booking_team_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = booking_team_assignments.staff_id
    AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Org admins can insert team assignments"
ON public.booking_team_assignments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.org_memberships om ON om.organization_id = b.organization_id
    WHERE b.id = booking_team_assignments.booking_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Org admins can update team assignments"
ON public.booking_team_assignments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.org_memberships om ON om.organization_id = b.organization_id
    WHERE b.id = booking_team_assignments.booking_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Org admins can delete team assignments"
ON public.booking_team_assignments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.org_memberships om ON om.organization_id = b.organization_id
    WHERE b.id = booking_team_assignments.booking_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  )
);

-- Enable realtime for team assignments
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_team_assignments;