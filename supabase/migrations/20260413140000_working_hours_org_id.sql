-- ============================================================
-- Add organization_id to working_hours
-- Previously isolated only via RLS join through staff table.
-- This adds a direct FK so queries can filter without the join,
-- and RLS policies become simpler and faster.
-- ============================================================

ALTER TABLE public.working_hours
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill from the staff table
UPDATE public.working_hours wh
SET organization_id = s.organization_id
FROM public.staff s
WHERE wh.staff_id = s.id
  AND wh.organization_id IS NULL;

-- Enforce NOT NULL now that all rows are backfilled
ALTER TABLE public.working_hours
  ALTER COLUMN organization_id SET NOT NULL;

-- Index for the most common query pattern
CREATE INDEX IF NOT EXISTS idx_working_hours_organization_id
  ON public.working_hours(organization_id);

-- ============================================================
-- Replace join-based RLS policies with direct column checks
-- ============================================================

DROP POLICY IF EXISTS "Org members can view working hours"   ON public.working_hours;
DROP POLICY IF EXISTS "Staff can manage own working hours"   ON public.working_hours;
DROP POLICY IF EXISTS "Org admins can manage working hours"  ON public.working_hours;
-- Legacy policy names from earlier migrations
DROP POLICY IF EXISTS "Admins can manage working hours"      ON public.working_hours;
DROP POLICY IF EXISTS "Anyone can view working hours"        ON public.working_hours;
DROP POLICY IF EXISTS "Public can view working hours"        ON public.working_hours;

-- Org members (admins / owners) can read their org's working hours
CREATE POLICY "Org members can view working hours"
ON public.working_hours FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Staff can manage their own schedule rows
CREATE POLICY "Staff can manage own working hours"
ON public.working_hours FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = working_hours.staff_id
      AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = working_hours.staff_id
      AND s.user_id = auth.uid()
  )
);

-- Org admins / owners can manage all working hours in their org
CREATE POLICY "Org admins can manage working hours"
ON public.working_hours FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);
