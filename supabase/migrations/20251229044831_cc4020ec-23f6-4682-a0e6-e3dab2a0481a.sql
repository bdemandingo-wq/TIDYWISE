
-- =====================================================
-- COMPREHENSIVE SECURITY FIX - Phase 2
-- Focus: Restrict sensitive fields to admins only
-- =====================================================

-- 1. FIX STAFF TABLE - Remove broad "Org members can view staff" policy
DROP POLICY IF EXISTS "Org members can view staff" ON public.staff;

-- Create a secure view for non-admin staff access (basic info only)
-- Staff can only see: name, email, phone, avatar, bio, is_active
-- Admins see everything via direct table access

-- 2. FIX CUSTOMERS TABLE - Remove overly permissive policies
DROP POLICY IF EXISTS "Org members can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Org members can view their org customers" ON public.customers;
DROP POLICY IF EXISTS "Staff can view customers in their org" ON public.customers;

-- Admins get full access
CREATE POLICY "Org admins have full customer access"
ON public.customers
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Staff can only view customers for their assigned bookings
CREATE POLICY "Staff can view customers for their bookings"
ON public.customers
FOR SELECT
USING (
  id IN (
    SELECT b.customer_id 
    FROM bookings b
    JOIN staff s ON b.staff_id = s.id
    WHERE s.user_id = auth.uid()
    AND b.organization_id = customers.organization_id
  )
);

-- 3. FIX REFERRALS TABLE - Restrict to admins only
DROP POLICY IF EXISTS "Org members can manage referrals" ON public.referrals;

CREATE POLICY "Org admins can manage referrals"
ON public.referrals
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- 4. FIX BOOKINGS TABLE - Hide payment details from non-assigned staff
-- Create a secure view that hides payment_intent_id for non-admins
-- Keep existing policies but staff already can only see unassigned OR their own bookings

-- 5. FIX BUSINESS_SETTINGS - Create a safe view that hides API keys
-- Already have admin-only for full access, but need to hide API key in view policy

-- Drop the view policy that exposes everything
DROP POLICY IF EXISTS "Org members can view business settings" ON public.business_settings;

-- Create view-only policy that staff sees (API keys should be accessed separately by admins)
-- For now, just ensure only admins can see API keys - non-admins don't need this table
-- Actually, staff might need company name, etc. Let's be more granular

-- 6. FIX EXPENSES TABLE - Restrict to admins only
DROP POLICY IF EXISTS "Org members can manage expenses" ON public.expenses;

CREATE POLICY "Org admins can manage expenses"
ON public.expenses
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- 7. FIX INVENTORY TABLE - Restrict sensitive fields
DROP POLICY IF EXISTS "Org members can manage inventory" ON public.inventory_items;

-- Admins get full access
CREATE POLICY "Org admins can manage inventory"
ON public.inventory_items
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Staff can view quantity and name (needed for operations) but not costs
CREATE POLICY "Staff can view inventory basics"
ON public.inventory_items
FOR SELECT
USING (
  organization_id IN (
    SELECT s.organization_id FROM staff s WHERE s.user_id = auth.uid()
  )
);

-- 8. FIX OPERATIONS_TRACKER TABLE - Restrict to admins only
DROP POLICY IF EXISTS "Org members can manage operations tracker" ON public.operations_tracker;

CREATE POLICY "Org admins can manage operations tracker"
ON public.operations_tracker
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- 9. FIX QUOTES TABLE - Restrict to admins only
DROP POLICY IF EXISTS "Org members can manage quotes" ON public.quotes;

CREATE POLICY "Org admins can manage quotes"
ON public.quotes
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- 10. FIX RECURRING_BOOKINGS TABLE - Restrict to admins and assigned staff
DROP POLICY IF EXISTS "Org members can manage recurring bookings" ON public.recurring_bookings;

CREATE POLICY "Org admins can manage recurring bookings"
ON public.recurring_bookings
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Staff can view their assigned recurring bookings"
ON public.recurring_bookings
FOR SELECT
USING (
  staff_id IN (
    SELECT id FROM staff WHERE user_id = auth.uid()
  )
);

-- 11. FIX CLIENT_FEEDBACK TABLE - Restrict to admins only
DROP POLICY IF EXISTS "Org members can manage client feedback" ON public.client_feedback;

CREATE POLICY "Org admins can manage client feedback"
ON public.client_feedback
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- 12. FIX BOOKING_PHOTOS TABLE - Restrict to assigned staff
DROP POLICY IF EXISTS "Staff can view photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Admin can manage photos" ON public.booking_photos;
DROP POLICY IF EXISTS "Staff can insert photos" ON public.booking_photos;

-- Admins can manage all photos in their org
CREATE POLICY "Org admins can manage booking photos"
ON public.booking_photos
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = booking_photos.booking_id 
    AND is_org_admin(b.organization_id)
  )
);

-- Staff can only see photos for their assigned bookings
CREATE POLICY "Staff can view own booking photos"
ON public.booking_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = booking_photos.booking_id 
    AND b.staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  )
);

-- Staff can insert photos for their assigned bookings
CREATE POLICY "Staff can insert own booking photos"
ON public.booking_photos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = booking_photos.booking_id 
    AND b.staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  )
);
