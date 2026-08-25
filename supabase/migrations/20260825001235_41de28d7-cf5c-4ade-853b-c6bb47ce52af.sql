-- 1. Wrap auth.uid() as (SELECT auth.uid()) in every public policy so it is
--    evaluated once per statement (initplan) instead of once per row.
DO $do$
DECLARE
  r record;
  stmt text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT
      pol.polname,
      c.relname,
      CASE WHEN pol.polqual IS NOT NULL THEN
        replace(replace(replace(pg_get_expr(pol.polqual, pol.polrelid),
          '( SELECT auth.uid() AS uid)', '@@U@@'),
          'auth.uid()', '(SELECT auth.uid())'),
          '@@U@@', '( SELECT auth.uid() AS uid)')
      END AS newqual,
      CASE WHEN pol.polwithcheck IS NOT NULL THEN
        replace(replace(replace(pg_get_expr(pol.polwithcheck, pol.polrelid),
          '( SELECT auth.uid() AS uid)', '@@U@@'),
          'auth.uid()', '(SELECT auth.uid())'),
          '@@U@@', '( SELECT auth.uid() AS uid)')
      END AS newcheck
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND (pg_get_expr(pol.polqual, pol.polrelid) LIKE '%auth.uid()%'
        OR pg_get_expr(pol.polwithcheck, pol.polrelid) LIKE '%auth.uid()%')
  LOOP
    stmt := format('ALTER POLICY %I ON public.%I', r.polname, r.relname)
         || coalesce(' USING (' || r.newqual || ')', '')
         || coalesce(' WITH CHECK (' || r.newcheck || ')', '');
    EXECUTE stmt;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'rewrote % policies', n;
END
$do$;

-- 2. The four bookings indexes the hottest queries actually sort/filter on.
CREATE INDEX IF NOT EXISTS idx_bookings_org_created_at
  ON public.bookings (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_org_scheduled_at
  ON public.bookings (organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_id
  ON public.bookings (customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_staff_id
  ON public.bookings (staff_id);

-- 3. Drop duplicate indexes. In every case an identical index on the same
--    columns remains (a unique-constraint index, or the more-used twin).
DROP INDEX IF EXISTS public.idx_abandoned_bookings_session;
DROP INDEX IF EXISTS public.idx_blog_posts_slug;
DROP INDEX IF EXISTS public.idx_booking_checklist_items_org_id;
DROP INDEX IF EXISTS public.idx_booking_checklists_org_id;
DROP INDEX IF EXISTS public.idx_booking_photos_org_id;
DROP INDEX IF EXISTS public.idx_booking_reminder_log_booking;
DROP INDEX IF EXISTS public.idx_booking_team_assignments_org_id;
DROP INDEX IF EXISTS public.idx_business_intelligence_org;
DROP INDEX IF EXISTS public.idx_business_settings_org;
DROP INDEX IF EXISTS public.idx_campaign_emails_org_id;
DROP INDEX IF EXISTS public.idx_cleaner_notifications_org_id;
DROP INDEX IF EXISTS public.idx_client_portal_users_customer;
DROP INDEX IF EXISTS public.idx_client_portal_users_username;
DROP INDEX IF EXISTS public.idx_deposit_requests_token;
DROP INDEX IF EXISTS public.idx_unsubscribe_tokens_token;
DROP INDEX IF EXISTS public.idx_invoice_items_org_id;
DROP INDEX IF EXISTS public.idx_invoices_organization_id;
DROP INDEX IF EXISTS public.idx_loyalty_transactions_org_id;
DROP INDEX IF EXISTS public.idx_org_gmail_connections_org;
DROP INDEX IF EXISTS public.idx_short_urls_code;
DROP INDEX IF EXISTS public.idx_suppressed_emails_email;
DROP INDEX IF EXISTS public.idx_team_messages_org_id;
DROP INDEX IF EXISTS public.idx_tips_token;

ANALYZE public.bookings;
ANALYZE public.customers;