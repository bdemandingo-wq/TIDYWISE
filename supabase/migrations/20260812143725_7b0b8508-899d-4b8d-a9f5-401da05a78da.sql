create table if not exists public.lead_notification_sends (
  lead_id         uuid primary key references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status          text not null default 'sending'
                    check (status in ('sending', 'sent', 'failed', 'skipped')),
  skip_reason     text,
  claimed_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists lead_notification_sends_org_idx
  on public.lead_notification_sends (organization_id, claimed_at desc);

alter table public.lead_notification_sends enable row level security;
revoke all on public.lead_notification_sends from anon, authenticated;
grant all on public.lead_notification_sends to service_role;

insert into public.organization_automations
  (organization_id, automation_type, is_enabled, description)
select o.id, 'facebook_lead_speed_to_lead', false,
       'Texts a new Facebook lead asking for a good time to call'
from public.organizations o
where o.slug = 'clean-collective'
on conflict (organization_id, automation_type) do nothing;

drop function if exists public.__vault_probe();
drop function if exists public.__vault_names();