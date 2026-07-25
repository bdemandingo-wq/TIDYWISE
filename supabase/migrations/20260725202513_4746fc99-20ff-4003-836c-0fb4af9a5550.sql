-- Remove the redundant owner-and-admin SELECT policy on org_stripe_settings.
-- The owner-only financial policy (Financial: owner+admin only) already
-- governs direct table access, and the get_org_stripe_settings_safe RPC
-- returns only non-secret fields to admins/owners.
DROP POLICY IF EXISTS "Owners and admins can view their org Stripe settings" ON public.org_stripe_settings;
