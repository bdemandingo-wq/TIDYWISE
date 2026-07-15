-- Backfill reverse-drift triggers.
--
-- Three triggers exist on the live database that have no migration backing:
--
--  1. validate_subscription_fields_trigger on public.profiles — BEFORE
--     INSERT OR UPDATE, validates subscription_tier / status / billing_cycle.
--
--  2. email_queue_wake_auth on pgmq.q_auth_emails — AFTER INSERT statement
--     trigger that wakes the email queue worker.
--
--  3. email_queue_wake_transactional on pgmq.q_transactional_emails —
--     AFTER INSERT statement trigger that wakes the email queue worker.
--
-- The pgmq.* queue tables are managed by the pgmq extension and only exist
-- once the corresponding queue has been created. On a fresh rebuild these
-- tables may not yet exist, so the trigger creation is guarded with a
-- to_regclass() check to avoid hard-failing the migration. Once the queue
-- is created (by pgmq.create()), a re-run of this migration will attach
-- the triggers.

-- 1. public.profiles → validate_subscription_fields()
DROP TRIGGER IF EXISTS validate_subscription_fields_trigger ON public.profiles;
CREATE TRIGGER validate_subscription_fields_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_subscription_fields();

-- 2. pgmq.q_auth_emails → email_queue_wake()
DO $outer$
BEGIN
  IF to_regclass('pgmq.q_auth_emails') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS email_queue_wake_auth ON pgmq.q_auth_emails';
    EXECUTE 'CREATE TRIGGER email_queue_wake_auth AFTER INSERT ON pgmq.q_auth_emails FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake()';
  ELSE
    RAISE NOTICE 'Skipping email_queue_wake_auth: pgmq.q_auth_emails does not exist yet';
  END IF;
END
$outer$;

-- 3. pgmq.q_transactional_emails → email_queue_wake()
DO $outer$
BEGIN
  IF to_regclass('pgmq.q_transactional_emails') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS email_queue_wake_transactional ON pgmq.q_transactional_emails';
    EXECUTE 'CREATE TRIGGER email_queue_wake_transactional AFTER INSERT ON pgmq.q_transactional_emails FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake()';
  ELSE
    RAISE NOTICE 'Skipping email_queue_wake_transactional: pgmq.q_transactional_emails does not exist yet';
  END IF;
END
$outer$;
