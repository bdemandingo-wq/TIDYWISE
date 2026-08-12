alter table public.leads add column if not exists backfilled_at timestamptz;

comment on column public.leads.backfilled_at is
  'Non-null when this row was imported from a historical source rather than arriving live. NULL means it arrived live. Outbound speed-to-lead automation MUST filter on `backfilled_at is null` - a backfilled row can be weeks old, and texting that person as a fresh enquiry is a real-world mistake, not just bad data.';

create index if not exists leads_live_recent_idx
  on public.leads (organization_id, created_at desc)
  where backfilled_at is null;