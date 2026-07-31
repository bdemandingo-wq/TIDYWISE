create table public.booking_submission_failures (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  organization_id  uuid references public.organizations(id) on delete set null,
  organization_slug text,
  stage            text not null,
  reason           text,
  client_ip        text,
  origin           text,
  user_agent       text,
  first_name       text,
  last_name        text,
  email            text,
  phone            text,
  payload          jsonb not null default '{}'::jsonb,
  path             text not null default 'public',
  constraint bsf_stage_chk check (stage in
    ('rate_limited','validation','conflict','db_error','auth','unknown')),
  constraint bsf_path_chk  check (path in ('public','integration'))
);

create index idx_bsf_org_created on public.booking_submission_failures (organization_id, created_at desc);
create index idx_bsf_created     on public.booking_submission_failures (created_at desc);

alter table public.booking_submission_failures enable row level security;

revoke all on public.booking_submission_failures from anon, authenticated;
grant select on public.booking_submission_failures to authenticated;
grant all    on public.booking_submission_failures to service_role;

create policy "Org admins read booking submission failures"
  on public.booking_submission_failures for select to authenticated
  using (public.is_org_admin(organization_id));

comment on table public.booking_submission_failures is
  'Failed public booking submissions. Holds PII (name/email/phone) so a lost booking remains a contactable lead — retention policy: purge rows older than 90 days.';