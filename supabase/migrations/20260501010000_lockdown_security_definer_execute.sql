-- Lock down EXECUTE on every SECURITY DEFINER function in the public schema.
--
-- Background. Supabase's database linter flags SECURITY DEFINER functions in
-- the public schema that are EXECUTE-able by `public` / `anon`. SECURITY
-- DEFINER bypasses RLS by running as the function owner, so leaving the
-- default PUBLIC grant in place lets any unauthenticated request invoke
-- privileged operations.
--
-- This migration replaces the implicit PUBLIC grant with explicit role
-- grants per function. Functions are split into three buckets:
--
--   A — Public-callable. Anon may invoke; the function validates its own
--       inputs (token-scoped lookups, demo helpers, public booking).
--   B — Authenticated-only. Requires a Supabase-auth user; relies on
--       auth.uid() inside the body to scope work to the caller's org.
--   C — Service-role-only. Internal: cron, vault, email queue, Stripe
--       cross-tenant lookups. Edge Functions invoke these via service_role.
--
-- TRIGGER FUNCTIONS (27 of them) are intentionally untouched. Triggers run
-- via the trigger machinery, not via EXECUTE; revoking PUBLIC EXECUTE on
-- them changes nothing. They are SECURITY DEFINER so they can write to
-- tables the firing user cannot, which is the desired behavior.
--
-- CLIENT-PORTAL CAVEAT. Customers on the client portal authenticate
-- through `validate_client_portal_login`, NOT through Supabase Auth, so
-- their browser sessions are anon from Postgres' perspective. The
-- `*_client_portal_*` RPCs therefore must remain anon-callable today.
-- Locking them to `authenticated` would break the live portal. They are
-- listed in Bucket A below with a TODO: a follow-up must route their
-- operations through an Edge Function that validates the portal session
-- token server-side, then move them to Bucket C.

-- ──────────────────────────────────────────────────────────────────────────
-- BUCKET A — anon, authenticated, service_role
-- Token-validated public flows + demo helpers + client-portal RPCs.
-- ──────────────────────────────────────────────────────────────────────────

-- Public booking demo helper (no PII; idempotent read).
REVOKE ALL ON FUNCTION public.get_demo_booked_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_booked_slots() TO anon, authenticated, service_role;

-- Token-scoped public lookups: caller possesses a single-use token emailed
-- to a customer. Internal validation lives in each function body.
REVOKE ALL ON FUNCTION public.get_deposit_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_deposit_by_token(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tip_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tip_by_token(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_review_request_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_request_by_token(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_review_by_token(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review_by_token(text, integer, text) TO anon, authenticated, service_role;

-- Client portal authentication entry point.
REVOKE ALL ON FUNCTION public.validate_client_portal_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_client_portal_login(text, text) TO anon, authenticated, service_role;

-- Client portal data RPCs. TODO: route through Edge Function with
-- session-token validation, then demote to service_role only (Bucket C).
REVOKE ALL ON FUNCTION public.get_client_portal_user_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_portal_user_data(text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_client_portal_last_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_client_portal_last_login(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_locations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_portal_locations(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.add_client_portal_location(uuid, text, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_client_portal_location(uuid, text, text, text, text, text, text, boolean) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_client_portal_location(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_portal_location(uuid, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_requests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_portal_requests(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_client_portal_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_portal_notifications(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_client_portal_notification(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_portal_notification(uuid, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_client_notification_read(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_client_notification_read(uuid, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_client_portal_profile(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_client_portal_profile(uuid, text, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_client_booking_request(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_booking_request(uuid, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.client_cancel_booking(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_cancel_booking(uuid, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_client_tax_report(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_tax_report(uuid, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_client_portal_referral(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_portal_referral(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.change_client_portal_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_client_portal_password(uuid, text, text) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- BUCKET B — authenticated, service_role
-- Supabase-auth callers only. Bodies use auth.uid() to scope work.
-- ──────────────────────────────────────────────────────────────────────────

-- Org membership / role helpers (called by RLS policies in authenticated context).
REVOKE ALL ON FUNCTION public.get_user_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_org_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_staff(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_can_view_customer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_can_view_customer(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_platform_blog_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_blog_admin() TO authenticated, service_role;

-- Loyalty tier metadata (org-scoped read; RLS on referenced tables enforces scope).
REVOKE ALL ON FUNCTION public.get_loyalty_tier_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loyalty_tier_info(uuid) TO authenticated, service_role;

-- Password utility — only legitimate callers are other RPCs and Edge
-- Functions. Hashing a password from anon is no risk (output is just a
-- bcrypt hash) but there is no reason to expose it.
REVOKE ALL ON FUNCTION public.hash_client_portal_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hash_client_portal_password(text) TO authenticated, service_role;

-- Admin/staff-initiated password reset.
REVOKE ALL ON FUNCTION public.reset_client_portal_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_client_portal_password(uuid, text) TO authenticated, service_role;

-- Account creation: invitation-based; admin/staff invokes.
REVOKE ALL ON FUNCTION public.create_client_portal_user(text, text, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_portal_user(text, text, uuid, uuid, boolean) TO authenticated, service_role;

-- Admin/staff converts a portal request into a booking.
REVOKE ALL ON FUNCTION public.create_booking_from_request(uuid, uuid, uuid, uuid, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_from_request(uuid, uuid, uuid, uuid, timestamptz, integer) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- BUCKET C — service_role only
-- Edge Functions, cron, internal queue/vault. No interactive caller path.
-- ──────────────────────────────────────────────────────────────────────────

-- Email queue (pgmq wrappers). Workers only.
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.read_email_batch(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, int, int) TO service_role;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Vault helpers for cron secret rotation.
REVOKE ALL ON FUNCTION public.vault_create_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_cron_secret(text) TO service_role;

REVOKE ALL ON FUNCTION public.vault_update_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_update_cron_secret(text) TO service_role;

-- Cross-tenant Stripe-account audit (already restricted by prior migration;
-- re-asserted here for completeness and safety against grant drift).
REVOKE ALL ON FUNCTION public.stripe_duplicate_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_duplicate_accounts() TO service_role;

-- Daily task reset is fired by cron only.
REVOKE ALL ON FUNCTION public.reset_daily_tasks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_daily_tasks() TO service_role;

-- Stripe secret access (locked down in 20260501000000_split_stripe_secrets.sql;
-- re-asserted here so grant state is fully captured by this migration).
REVOKE ALL ON FUNCTION public.get_org_stripe_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_stripe_secret(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.find_org_by_stripe_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_org_by_stripe_secret(text) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- TRIGGER FUNCTIONS — revoke the implicit PUBLIC EXECUTE for tidiness.
-- The trigger machinery does not consult EXECUTE; this is purely so the
-- linter sees no "function callable by public" on these names.
-- ──────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_welcome_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_welcome_email_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_loyalty_progress_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_loyalty_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_activate_customer_on_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_sync_recurring_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_customer_recurring_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_rebooking_reminder_on_new_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_rebooking_reminder_on_complete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_recurring_offer_on_recurring_booked() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_recurring_offer_on_complete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_review_sms_on_complete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_ai_conversion_on_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_new_booking_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_booking_claimed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_payout_setup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_staff_document_upload() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admin_staff_signature() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_new_org_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_default_automations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_org_feature_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_default_reminder_intervals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_openphone_feature_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_payment_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_tracking_on_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_blog_post_status() FROM PUBLIC, anon, authenticated;
