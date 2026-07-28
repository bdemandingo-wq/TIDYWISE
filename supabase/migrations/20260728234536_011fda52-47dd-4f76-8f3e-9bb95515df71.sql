ALTER TABLE public.campaign_runs
  DROP CONSTRAINT IF EXISTS campaign_runs_cancel_reason_check;

ALTER TABLE public.campaign_runs
  ADD CONSTRAINT campaign_runs_cancel_reason_check
  CHECK (
    cancel_reason IS NULL
    OR cancel_reason = ANY (ARRAY['expired'::text, 'user_cancelled'::text, 'enqueue_stalled'::text])
  );

COMMENT ON COLUMN public.campaign_runs.total_recipients IS
  'MUST be set in the same INSERT that creates the run, never by a follow-up UPDATE. The AFTER INSERT trigger campaign_queue_wake_trigger arms the dispatcher on the committed row, and process-campaign-queue uses total_recipients to decide completion (progress = sent_count + failed_count + skipped_opted_out_count >= total_recipients). A run inserted with a placeholder count can be completed or stall-cancelled before its recipients are enqueued.';