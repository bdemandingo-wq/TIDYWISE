create table if not exists public.facebook_page_connections (
  page_id           text primary key,
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  page_name         text,
  page_access_token text,
  is_active         boolean not null default true,
  connected_by      uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists facebook_page_connections_org_idx
  on public.facebook_page_connections (organization_id);

alter table public.facebook_page_connections enable row level security;

-- Deliberately NO policies for anon or authenticated: page_access_token is a
-- secret. Service role bypasses RLS, which is the only access this needs.
revoke all on public.facebook_page_connections from anon, authenticated;
grant all on public.facebook_page_connections to service_role;

insert into public.facebook_page_connections (page_id, organization_id, page_name)
select '1143280425539142', o.id, 'Clean Collective'
from public.organizations o
where o.slug = 'clean-collective'
on conflict (page_id) do nothing;

do $$
begin
  if not exists (
    select 1 from public.facebook_page_connections
    where page_id = '1143280425539142'
  ) then
    raise exception
      'Seed failed: no organizations row with slug=clean-collective; find the correct slug before re-running.';
  end if;
end $$;

alter table public.facebook_lead_webhook_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create index if not exists facebook_lead_webhook_events_org_idx
  on public.facebook_lead_webhook_events (organization_id, created_at desc);