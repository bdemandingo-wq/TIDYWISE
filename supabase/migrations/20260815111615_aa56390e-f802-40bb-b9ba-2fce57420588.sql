create table if not exists public.broadcasts (
  id                   uuid primary key default gen_random_uuid(),
  subject              text not null check (length(btrim(subject)) between 1 and 200),
  body_text            text not null check (length(btrim(body_text)) >= 1),
  message_class        text not null check (message_class in ('transactional','marketing')),
  status               text not null default 'draft'
                         check (status in ('draft','sending','sent','failed','cancelled')),
  created_by           uuid not null references auth.users(id),
  recipient_count      integer not null default 0,
  sent_count           integer not null default 0,
  failed_count         integer not null default 0,
  skipped_count        integer not null default 0,
  audience_resolved_at timestamptz,
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.broadcast_recipients (
  id                  uuid primary key default gen_random_uuid(),
  broadcast_id        uuid not null references public.broadcasts(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  user_id             uuid not null,
  email               text not null,
  status              text not null default 'queued'
                        check (status in ('queued','sending','sent','failed','skipped')),
  skip_reason         text,
  provider_message_id text,
  error_message       text,
  attempts            integer not null default 0,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (broadcast_id, email)
);

create index if not exists idx_broadcast_recipients_claim
  on public.broadcast_recipients (broadcast_id, status, id);
create index if not exists idx_broadcast_recipients_status
  on public.broadcast_recipients (status) where status = 'queued';

alter table public.broadcasts            enable row level security;
alter table public.broadcast_recipients  enable row level security;

revoke all on public.broadcasts           from anon, authenticated;
revoke all on public.broadcast_recipients from anon, authenticated;

grant all  on public.broadcasts           to service_role;
grant all  on public.broadcast_recipients to service_role;

grant select on public.broadcasts           to authenticated;
grant select on public.broadcast_recipients to authenticated;

create policy "Platform admins can view broadcasts"
  on public.broadcasts for select to authenticated
  using (public.is_platform_admin());

create policy "Platform admins can view broadcast recipients"
  on public.broadcast_recipients for select to authenticated
  using (public.is_platform_admin());

create or replace function public.broadcast_audience(p_message_class text)
returns table (
  organization_id uuid,
  user_id         uuid,
  email           text,
  eligible        boolean,
  skip_reason     text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (lower(u.email))
    o.id,
    o.owner_id,
    lower(u.email),
    case
      when p_message_class = 'transactional' then true
      when p.email_unsubscribed is true      then false
      when s.email is not null               then false
      else true
    end,
    case
      when p_message_class = 'transactional' then null
      when p.email_unsubscribed is true      then 'unsubscribed'
      when s.email is not null               then 'suppressed'
      else null
    end
  from public.organizations o
  join auth.users u             on u.id = o.owner_id
  left join public.profiles p   on p.id = o.owner_id
  left join public.suppressed_emails s on lower(s.email) = lower(u.email)
  where u.email is not null
    and p_message_class in ('transactional','marketing')
    and public.is_platform_admin()
  order by lower(u.email), o.created_at asc;
$$;

revoke all on function public.broadcast_audience(text) from public, anon;
grant execute on function public.broadcast_audience(text) to authenticated, service_role;