create table if not exists public.facebook_lead_ingestions (
  leadgen_id      text primary key,
  lead_id         uuid references public.leads(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists facebook_lead_ingestions_org_idx
  on public.facebook_lead_ingestions (organization_id, created_at desc);

alter table public.facebook_lead_ingestions enable row level security;
revoke all on public.facebook_lead_ingestions from anon, authenticated;
grant all on public.facebook_lead_ingestions to service_role;