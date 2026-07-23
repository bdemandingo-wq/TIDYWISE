DO $$
DECLARE
  stale_job_id bigint;
BEGIN
  FOR stale_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobid IN (7, 10, 17, 19, 20, 30)
    ORDER BY jobid
  LOOP
    PERFORM cron.unschedule(stale_job_id);
  END LOOP;
END $$;