-- Campaign queue port — pre-flight schema verification
-- 2026-07-28. READ-ONLY. Safe to run against production.
-- Run each block, paste results back. Nothing here writes or locks.

-- ═══════════════════════════════════════════════════════════════
-- 1. Does automated_campaigns have scheduled_at (or any scheduling column)?
--    Expected from code reading: NO scheduled_at. Confirm before building.
-- ═══════════════════════════════════════════════════════════════
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'automated_campaigns'
order by ordinal_position;

-- Narrower check — did we miss a differently-named scheduling column anywhere?
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%schedul%' or column_name ilike '%send_after%'
       or column_name ilike '%run_at%' or column_name ilike '%next_run%')
order by table_name, column_name;


-- ═══════════════════════════════════════════════════════════════
-- 2. What PGMQ queues already exist?
-- ═══════════════════════════════════════════════════════════════

-- Is the extension installed, and where?
select extname, extversion, extnamespace::regnamespace as schema
from pg_extension
where extname = 'pgmq';

-- Canonical queue list. If list_queues() errors on this pgmq version,
-- the pgmq.meta query below is the fallback — run whichever works.
select * from pgmq.list_queues();

-- Fallback / cross-check: pgmq stores one q_<name> table per queue.
select
  c.relname as backing_table,
  replace(c.relname, 'q_', '') as queue_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) as size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'pgmq'
  and c.relkind = 'r'
  and c.relname like 'q\_%'
order by c.relname;

-- Current depth of each queue (how much is sitting unprocessed right now).
-- Useful baseline before we add a second producer.
select
  n.nspname || '.' || c.relname as tbl,
  (xpath('/row/c/text()',
     query_to_xml('select count(*) as c from ' || quote_ident(n.nspname) || '.' || quote_ident(c.relname),
                  false, true, '')))[1]::text::bigint as row_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'pgmq' and c.relkind = 'r' and c.relname like 'q\_%'
order by 1;


-- ═══════════════════════════════════════════════════════════════
-- 3. Shape of the process-email-queue cron entry
--    We want to copy this pattern exactly for the campaign worker.
-- ═══════════════════════════════════════════════════════════════
select
  jobid,
  jobname,
  schedule,
  active,
  database,
  username,
  command
from cron.job
order by jobname;

-- Recent run history — is it actually firing, and does it succeed?
select
  j.jobname,
  r.status,
  count(*)              as runs,
  max(r.start_time)     as last_run,
  max(r.return_message) as last_message
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where r.start_time > now() - interval '24 hours'
group by j.jobname, r.status
order by j.jobname, r.status;


-- ═══════════════════════════════════════════════════════════════
-- 4. Bonus — confirms two claims the plan depends on.
-- ═══════════════════════════════════════════════════════════════

-- (a) The opt-out columns the STOP webhook writes, and their live shape.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'customers'
  and column_name in ('marketing_status','opted_out_at','opted_out_method','opted_out_campaign_id')
order by column_name;

-- (b) How many customers are currently opted out, per org.
--     If this is 0 everywhere, the STOP path may never have fired in prod.
select
  organization_id,
  marketing_status,
  count(*) as customers
from public.customers
group by organization_id, marketing_status
order by organization_id, marketing_status;

-- (c) Does the email failure log RPC exist (referenced by send-org-email.ts)?
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'log_org_email_send_failure';
