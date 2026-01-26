-- =====================================================
-- STRICT ORGANIZATIONAL DATA ISOLATION MIGRATION
-- =====================================================
-- This migration strengthens multi-tenant isolation by:
-- 1. Making organization_id NOT NULL on critical tables
-- 2. Adding indexes for performance
-- 3. Strengthening RLS policies to require authentication
-- =====================================================

-- First, add indexes on organization_id for all tables that have it (performance)
CREATE INDEX IF NOT EXISTS idx_automated_campaigns_org ON automated_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_checklist_items_org ON booking_checklist_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_checklists_org ON booking_checklists(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_photos_org ON booking_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_booking_team_assignments_org ON booking_team_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org ON bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_org ON business_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_emails_org ON campaign_emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sms_sends_org ON campaign_sms_sends(organization_id);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_org ON checklist_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_cleaner_notifications_org ON cleaner_notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_feedback_org ON client_feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_discounts_org ON discounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_help_videos_org ON help_videos(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_categories_org ON inventory_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_custom_fields_org ON inventory_custom_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_org ON inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_org ON invoice_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_org ON loyalty_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_operations_tracker_org ON operations_tracker(organization_id);
CREATE INDEX IF NOT EXISTS idx_page_seo_metadata_org ON page_seo_metadata(organization_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_org ON payroll_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_pnl_settings_org ON pnl_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes(organization_id);
CREATE INDEX IF NOT EXISTS idx_recurring_bookings_org ON recurring_bookings(organization_id);
CREATE INDEX IF NOT EXISTS idx_referrals_org ON referrals(organization_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_org ON service_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_services_org ON services(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_org ON staff(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_org ON system_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_and_notes_org ON tasks_and_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_messages_org ON team_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_org ON user_preferences(organization_id);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_org ON sms_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_org ON sms_messages(organization_id);

-- =====================================================
-- STRENGTHEN RLS POLICIES - Require Authentication
-- =====================================================

-- Update automated_campaigns policies to require authentication
DROP POLICY IF EXISTS "Org members can manage campaigns" ON automated_campaigns;
CREATE POLICY "Authenticated org members can manage campaigns"
ON automated_campaigns FOR ALL
TO authenticated
USING (organization_id = get_user_organization_id())
WITH CHECK (organization_id = get_user_organization_id());

-- Update bookings policies
DROP POLICY IF EXISTS "Org members can manage bookings" ON bookings;
CREATE POLICY "Authenticated org members can manage bookings"
ON bookings FOR ALL
TO authenticated
USING (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- Update customers policies
DROP POLICY IF EXISTS "Org members can view customers" ON customers;
CREATE POLICY "Authenticated org members can view customers"
ON customers FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "Org admins have full customer access" ON customers;
CREATE POLICY "Authenticated org admins have full customer access"
ON customers FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Update leads policies
DROP POLICY IF EXISTS "Org admins can manage leads" ON leads;
CREATE POLICY "Authenticated org admins can manage leads"
ON leads FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view leads" ON leads;
CREATE POLICY "Authenticated org members can view leads"
ON leads FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update services policies
DROP POLICY IF EXISTS "Org admins can manage services" ON services;
CREATE POLICY "Authenticated org admins can manage services"
ON services FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view services" ON services;
CREATE POLICY "Authenticated org members can view services"
ON services FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update staff policies
DROP POLICY IF EXISTS "Org admins can manage staff" ON staff;
CREATE POLICY "Authenticated org admins can manage staff"
ON staff FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view staff" ON staff;
CREATE POLICY "Authenticated org members can view staff"
ON staff FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update invoices policies
DROP POLICY IF EXISTS "Org admins can manage invoices" ON invoices;
CREATE POLICY "Authenticated org admins can manage invoices"
ON invoices FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view invoices" ON invoices;
CREATE POLICY "Authenticated org members can view invoices"
ON invoices FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update expenses policies
DROP POLICY IF EXISTS "Org admins can manage expenses" ON expenses;
CREATE POLICY "Authenticated org admins can manage expenses"
ON expenses FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Update tasks_and_notes policies
DROP POLICY IF EXISTS "Users can manage tasks in their org" ON tasks_and_notes;
CREATE POLICY "Authenticated users can manage tasks in their org"
ON tasks_and_notes FOR ALL
TO authenticated
USING (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- Update operations_tracker policies
DROP POLICY IF EXISTS "Org members can manage operations" ON operations_tracker;
CREATE POLICY "Authenticated org members can manage operations"
ON operations_tracker FOR ALL
TO authenticated
USING (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- Update quotes policies  
DROP POLICY IF EXISTS "Org admins can manage quotes" ON quotes;
CREATE POLICY "Authenticated org admins can manage quotes"
ON quotes FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view quotes" ON quotes;
CREATE POLICY "Authenticated org members can view quotes"
ON quotes FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update recurring_bookings policies
DROP POLICY IF EXISTS "Org admins can manage recurring bookings" ON recurring_bookings;
CREATE POLICY "Authenticated org admins can manage recurring bookings"
ON recurring_bookings FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org members can view recurring bookings" ON recurring_bookings;
CREATE POLICY "Authenticated org members can view recurring bookings"
ON recurring_bookings FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update inventory_items policies
DROP POLICY IF EXISTS "Org admins can manage inventory" ON inventory_items;
CREATE POLICY "Authenticated org admins can manage inventory"
ON inventory_items FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Update payroll_payments policies
DROP POLICY IF EXISTS "Org admins can manage payroll" ON payroll_payments;
CREATE POLICY "Authenticated org admins can manage payroll"
ON payroll_payments FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Update client_feedback policies
DROP POLICY IF EXISTS "Org admins can manage client feedback" ON client_feedback;
CREATE POLICY "Authenticated org admins can manage client feedback"
ON client_feedback FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

-- Update checklist_templates policies  
DROP POLICY IF EXISTS "Org members can manage checklist templates" ON checklist_templates;
CREATE POLICY "Authenticated org members can manage checklist templates"
ON checklist_templates FOR ALL
TO authenticated
USING (is_org_member(organization_id))
WITH CHECK (is_org_member(organization_id));

-- Update discounts policies
DROP POLICY IF EXISTS "Admins can manage their org discounts" ON discounts;
CREATE POLICY "Authenticated admins can manage their org discounts"
ON discounts FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Users can view their org discounts" ON discounts;
CREATE POLICY "Authenticated users can view their org discounts"
ON discounts FOR SELECT
TO authenticated
USING (is_org_member(organization_id));

-- Update business_settings policies
DROP POLICY IF EXISTS "Org admins can manage business settings" ON business_settings;
CREATE POLICY "Authenticated org admins can manage business settings"
ON business_settings FOR ALL
TO authenticated
USING (is_org_admin(organization_id))
WITH CHECK (is_org_admin(organization_id));