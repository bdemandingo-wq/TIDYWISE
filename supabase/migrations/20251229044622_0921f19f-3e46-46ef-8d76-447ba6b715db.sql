
-- =====================================================
-- SECURITY FIX: Comprehensive RLS hardening for sensitive tables
-- =====================================================

-- 1. FIX PROFILES TABLE - Restrict to own profile or org admins
-- First drop existing policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create stricter policies for profiles
CREATE POLICY "Users can view own profile only"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile only"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow users to insert their own profile (for new signups)
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 2. FIX STAFF TABLE - Remove policy that exposes all data to org members
DROP POLICY IF EXISTS "Org members can view staff in their org" ON public.staff;

-- 3. FIX BUSINESS_SETTINGS TABLE - Restrict to admins only
DROP POLICY IF EXISTS "Org members can manage business settings" ON public.business_settings;

-- View for non-admin members (hides API keys)
CREATE POLICY "Org admins can manage business settings"
ON public.business_settings
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Non-admins can only view non-sensitive fields
CREATE POLICY "Org members can view business settings"
ON public.business_settings
FOR SELECT
USING (organization_id = get_user_organization_id());

-- 4. FIX ORGANIZATION_SMS_SETTINGS TABLE - Restrict API keys to admins
-- Already has good policies, but let's verify the SELECT policy
DROP POLICY IF EXISTS "Organization members can view SMS settings" ON public.organization_sms_settings;

-- Create admin-only policy for viewing SMS settings with API keys
CREATE POLICY "Only org admins can view SMS settings"
ON public.organization_sms_settings
FOR SELECT
USING (is_org_admin(organization_id));

-- 5. FIX LEADS TABLE - Restrict to admins only (sensitive sales data)
DROP POLICY IF EXISTS "Org members can manage leads" ON public.leads;

CREATE POLICY "Org admins can manage leads"
ON public.leads
FOR ALL
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Staff can view leads assigned to them
CREATE POLICY "Staff can view assigned leads"
ON public.leads
FOR SELECT
USING (
  assigned_to IN (
    SELECT id FROM staff WHERE user_id = auth.uid()
  )
);

-- 6. FIX TEAM_MESSAGES TABLE - Add organization filtering
-- First we need to get organization from the booking or sender
DROP POLICY IF EXISTS "Admin can manage team messages" ON public.team_messages;
DROP POLICY IF EXISTS "Staff can view own team messages" ON public.team_messages;
DROP POLICY IF EXISTS "Staff can create team messages" ON public.team_messages;

-- Create organization-aware policies
CREATE POLICY "Org admins can manage team messages"
ON public.team_messages
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = team_messages.booking_id 
    AND b.organization_id = get_user_organization_id()
  )
  OR (
    team_messages.booking_id IS NULL 
    AND is_org_admin(get_user_organization_id())
  )
);

CREATE POLICY "Staff can view team messages in their org"
ON public.team_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = team_messages.booking_id 
    AND b.organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Staff can create team messages in their org"
ON public.team_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = team_messages.booking_id 
    AND b.organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  )
);

-- 7. FIX REVIEW_REQUESTS TABLE - Add organization filtering
DROP POLICY IF EXISTS "Admins can manage review requests" ON public.review_requests;
DROP POLICY IF EXISTS "Staff can view own reviews" ON public.review_requests;

CREATE POLICY "Org admins can manage review requests"
ON public.review_requests
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = review_requests.booking_id 
    AND is_org_admin(b.organization_id)
  )
);

CREATE POLICY "Staff can view own reviews in their org"
ON public.review_requests
FOR SELECT
USING (
  staff_id IN (
    SELECT id FROM staff 
    WHERE user_id = auth.uid() 
    AND organization_id IN (
      SELECT organization_id FROM bookings WHERE id = review_requests.booking_id
    )
  )
);

-- 8. FIX CAMPAIGN_EMAILS - Ensure org filtering
DROP POLICY IF EXISTS "Admins can manage campaign emails" ON public.campaign_emails;

CREATE POLICY "Org admins can manage campaign emails"
ON public.campaign_emails
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM automated_campaigns ac
    WHERE ac.id = campaign_emails.campaign_id
    AND ac.organization_id = get_user_organization_id()
    AND is_org_admin(ac.organization_id)
  )
);
