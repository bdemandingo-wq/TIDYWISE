-- Remove the Recurring Lapse Alert automation entirely.
--
-- It was structurally miswired for this app (see 20260725160000): its catch-up
-- check keys on bookings.recurring_booking_id, a column no code path ever
-- writes, so it could only ever fire false positives. It is already unscheduled;
-- this migration deletes the per-org toggle rows and defensively unschedules the
-- cron in case it exists anywhere. automation_fire_log history is intentionally
-- left in place.
--
-- Note: the seed lives in already-applied one-time backfills
-- (20260506203400, 20260506205254) which are not edited. No trigger re-seeds
-- this automation, and on a full replay this migration runs after those
-- backfills, so the end state is "removed" either way.

DELETE FROM public.organization_automations
WHERE automation_type = 'recurring_lapse_alert';

DO $$ BEGIN
  PERFORM cron.unschedule('recurring-booking-lapse-alert');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
