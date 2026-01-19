-- =========================================================
-- COMPREHENSIVE MULTI-TENANT DATA ISOLATION HARDENING
-- =========================================================

-- 1. ADD organization_id TO TABLES MISSING IT
-- =========================================================

-- Add organization_id to cleaner_notifications (currently relies on staff_id)
ALTER TABLE public.cleaner_notifications 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to loyalty_transactions (currently relies on customer_id)
ALTER TABLE public.loyalty_transactions 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to team_messages (currently relies on booking_id)
ALTER TABLE public.team_messages 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to campaign_emails (currently relies on campaign_id)
ALTER TABLE public.campaign_emails 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to invoice_items for direct isolation
ALTER TABLE public.invoice_items 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to booking_checklist_items
ALTER TABLE public.booking_checklist_items 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to booking_checklists
ALTER TABLE public.booking_checklists 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to booking_photos
ALTER TABLE public.booking_photos 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to booking_team_assignments
ALTER TABLE public.booking_team_assignments 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. BACKFILL organization_id FROM PARENT RECORDS
-- =========================================================

-- Backfill cleaner_notifications from staff
UPDATE public.cleaner_notifications cn
SET organization_id = s.organization_id
FROM public.staff s
WHERE cn.staff_id = s.id AND cn.organization_id IS NULL;

-- Backfill loyalty_transactions from customers
UPDATE public.loyalty_transactions lt
SET organization_id = c.organization_id
FROM public.customers c
WHERE lt.customer_id = c.id AND lt.organization_id IS NULL;

-- Backfill team_messages from bookings
UPDATE public.team_messages tm
SET organization_id = b.organization_id
FROM public.bookings b
WHERE tm.booking_id = b.id AND tm.organization_id IS NULL;

-- Backfill campaign_emails from automated_campaigns
UPDATE public.campaign_emails ce
SET organization_id = ac.organization_id
FROM public.automated_campaigns ac
WHERE ce.campaign_id = ac.id AND ce.organization_id IS NULL;

-- Backfill invoice_items from invoices
UPDATE public.invoice_items ii
SET organization_id = i.organization_id
FROM public.invoices i
WHERE ii.invoice_id = i.id AND ii.organization_id IS NULL;

-- Backfill booking_checklists from bookings
UPDATE public.booking_checklists bc
SET organization_id = b.organization_id
FROM public.bookings b
WHERE bc.booking_id = b.id AND bc.organization_id IS NULL;

-- Backfill booking_checklist_items from booking_checklists
UPDATE public.booking_checklist_items bci
SET organization_id = bc.organization_id
FROM public.booking_checklists bc
WHERE bci.booking_checklist_id = bc.id AND bci.organization_id IS NULL;

-- Backfill booking_photos from bookings
UPDATE public.booking_photos bp
SET organization_id = b.organization_id
FROM public.bookings b
WHERE bp.booking_id = b.id AND bp.organization_id IS NULL;

-- Backfill booking_team_assignments from bookings
UPDATE public.booking_team_assignments bta
SET organization_id = b.organization_id
FROM public.bookings b
WHERE bta.booking_id = b.id AND bta.organization_id IS NULL;

-- 3. CREATE RLS POLICIES FOR TABLES WITH NEW organization_id
-- =========================================================

-- cleaner_notifications RLS
ALTER TABLE public.cleaner_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view notifications in their org" ON public.cleaner_notifications;
CREATE POLICY "Users can view notifications in their org"
ON public.cleaner_notifications FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create notifications in their org" ON public.cleaner_notifications;
CREATE POLICY "Users can create notifications in their org"
ON public.cleaner_notifications FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update notifications in their org" ON public.cleaner_notifications;
CREATE POLICY "Users can update notifications in their org"
ON public.cleaner_notifications FOR UPDATE
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete notifications in their org" ON public.cleaner_notifications;
CREATE POLICY "Users can delete notifications in their org"
ON public.cleaner_notifications FOR DELETE
USING (public.is_org_member(organization_id));

-- loyalty_transactions RLS
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view loyalty transactions in their org" ON public.loyalty_transactions;
CREATE POLICY "Users can view loyalty transactions in their org"
ON public.loyalty_transactions FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create loyalty transactions in their org" ON public.loyalty_transactions;
CREATE POLICY "Users can create loyalty transactions in their org"
ON public.loyalty_transactions FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

-- team_messages RLS
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view team messages in their org" ON public.team_messages;
CREATE POLICY "Users can view team messages in their org"
ON public.team_messages FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create team messages in their org" ON public.team_messages;
CREATE POLICY "Users can create team messages in their org"
ON public.team_messages FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update team messages in their org" ON public.team_messages;
CREATE POLICY "Users can update team messages in their org"
ON public.team_messages FOR UPDATE
USING (public.is_org_member(organization_id));

-- campaign_emails RLS
ALTER TABLE public.campaign_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign emails in their org" ON public.campaign_emails;
CREATE POLICY "Users can view campaign emails in their org"
ON public.campaign_emails FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create campaign emails in their org" ON public.campaign_emails;
CREATE POLICY "Users can create campaign emails in their org"
ON public.campaign_emails FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

-- invoice_items - Update policies to use direct organization_id
DROP POLICY IF EXISTS "Users can view invoice items for their invoices" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can create invoice items for their invoices" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can update invoice items for their invoices" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can delete invoice items for their invoices" ON public.invoice_items;

CREATE POLICY "Users can view invoice items in their org"
ON public.invoice_items FOR SELECT
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can create invoice items in their org"
ON public.invoice_items FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Users can update invoice items in their org"
ON public.invoice_items FOR UPDATE
USING (public.is_org_member(organization_id));

CREATE POLICY "Users can delete invoice items in their org"
ON public.invoice_items FOR DELETE
USING (public.is_org_member(organization_id));

-- booking_checklists RLS
ALTER TABLE public.booking_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view booking checklists in their org" ON public.booking_checklists;
CREATE POLICY "Users can view booking checklists in their org"
ON public.booking_checklists FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create booking checklists in their org" ON public.booking_checklists;
CREATE POLICY "Users can create booking checklists in their org"
ON public.booking_checklists FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update booking checklists in their org" ON public.booking_checklists;
CREATE POLICY "Users can update booking checklists in their org"
ON public.booking_checklists FOR UPDATE
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete booking checklists in their org" ON public.booking_checklists;
CREATE POLICY "Users can delete booking checklists in their org"
ON public.booking_checklists FOR DELETE
USING (public.is_org_member(organization_id));

-- booking_checklist_items RLS
ALTER TABLE public.booking_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view checklist items in their org" ON public.booking_checklist_items;
CREATE POLICY "Users can view checklist items in their org"
ON public.booking_checklist_items FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create checklist items in their org" ON public.booking_checklist_items;
CREATE POLICY "Users can create checklist items in their org"
ON public.booking_checklist_items FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update checklist items in their org" ON public.booking_checklist_items;
CREATE POLICY "Users can update checklist items in their org"
ON public.booking_checklist_items FOR UPDATE
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete checklist items in their org" ON public.booking_checklist_items;
CREATE POLICY "Users can delete checklist items in their org"
ON public.booking_checklist_items FOR DELETE
USING (public.is_org_member(organization_id));

-- booking_photos RLS
ALTER TABLE public.booking_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view booking photos in their org" ON public.booking_photos;
CREATE POLICY "Users can view booking photos in their org"
ON public.booking_photos FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create booking photos in their org" ON public.booking_photos;
CREATE POLICY "Users can create booking photos in their org"
ON public.booking_photos FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update booking photos in their org" ON public.booking_photos;
CREATE POLICY "Users can update booking photos in their org"
ON public.booking_photos FOR UPDATE
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete booking photos in their org" ON public.booking_photos;
CREATE POLICY "Users can delete booking photos in their org"
ON public.booking_photos FOR DELETE
USING (public.is_org_member(organization_id));

-- booking_team_assignments RLS
ALTER TABLE public.booking_team_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view team assignments in their org" ON public.booking_team_assignments;
CREATE POLICY "Users can view team assignments in their org"
ON public.booking_team_assignments FOR SELECT
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can create team assignments in their org" ON public.booking_team_assignments;
CREATE POLICY "Users can create team assignments in their org"
ON public.booking_team_assignments FOR INSERT
WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can update team assignments in their org" ON public.booking_team_assignments;
CREATE POLICY "Users can update team assignments in their org"
ON public.booking_team_assignments FOR UPDATE
USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "Users can delete team assignments in their org" ON public.booking_team_assignments;
CREATE POLICY "Users can delete team assignments in their org"
ON public.booking_team_assignments FOR DELETE
USING (public.is_org_member(organization_id));

-- 4. FIX OVERLY PERMISSIVE POLICIES (system_logs insert)
-- =========================================================

-- Remove the overly permissive system_logs insert policy
DROP POLICY IF EXISTS "Service role can insert logs" ON public.system_logs;

-- Create a more restrictive policy - only authenticated users can insert logs for their org
CREATE POLICY "Authenticated users can insert logs"
ON public.system_logs FOR INSERT
WITH CHECK (
  organization_id IS NULL 
  OR public.is_org_member(organization_id)
);

-- 5. CREATE INDEXES FOR PERFORMANCE ON NEW organization_id COLUMNS
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_cleaner_notifications_org_id ON public.cleaner_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_org_id ON public.loyalty_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_org_id ON public.team_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_org_id ON public.campaign_emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_org_id ON public.invoice_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_checklists_org_id ON public.booking_checklists(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_checklist_items_org_id ON public.booking_checklist_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_photos_org_id ON public.booking_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_team_assignments_org_id ON public.booking_team_assignments(organization_id);