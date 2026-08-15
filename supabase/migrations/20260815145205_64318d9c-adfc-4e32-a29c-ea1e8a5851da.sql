create table if not exists public.org_referral_codes (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint org_referral_codes_alphabet
    check (code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

create table if not exists public.org_referrals (
  id uuid primary key default gen_random_uuid(),
  referral_code text not null,
  referrer_org_id uuid not null references public.organizations(id) on delete cascade,
  referred_org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','qualified','rewarded','rejected','expired')),
  rejection_reason text,
  referred_paid_invoice_count integer not null default 0,
  referred_first_payment_at timestamptz,
  referred_second_payment_at timestamptz,
  referrer_reward_granted_at timestamptz,
  referred_card_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_referrals_referred_once unique (referred_org_id),
  constraint org_referrals_no_self check (referrer_org_id <> referred_org_id)
);

create index if not exists org_referrals_referrer_status_idx
  on public.org_referrals (referrer_org_id, status);
create index if not exists org_referrals_code_idx
  on public.org_referrals (referral_code);

create table if not exists public.org_referral_credits (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  months_granted integer not null default 0,
  months_redeemed integer not null default 0,
  active_coupon_id text,
  updated_at timestamptz not null default now(),
  constraint org_referral_credits_non_negative
    check (months_granted >= 0 and months_redeemed >= 0)
);

create table if not exists public.org_referral_bonuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  months integer not null check (months > 0),
  qualifying_referral_ids uuid[] not null,
  granted_at timestamptz not null default now(),
  constraint org_referral_bonus_once unique (organization_id)
);

grant select on public.org_referral_codes to authenticated;
grant all on public.org_referral_codes to service_role;
grant select on public.org_referrals to authenticated;
grant all on public.org_referrals to service_role;
grant select on public.org_referral_credits to authenticated;
grant all on public.org_referral_credits to service_role;
grant select on public.org_referral_bonuses to authenticated;
grant all on public.org_referral_bonuses to service_role;

alter table public.org_referral_codes   enable row level security;
alter table public.org_referrals        enable row level security;
alter table public.org_referral_credits enable row level security;
alter table public.org_referral_bonuses enable row level security;

create policy "members read own referral code" on public.org_referral_codes
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referral_codes.organization_id
                   and m.user_id = auth.uid()));

create policy "members read own referrals" on public.org_referrals
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referrals.referrer_org_id
                   and m.user_id = auth.uid()));

create policy "members read own credits" on public.org_referral_credits
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referral_credits.organization_id
                   and m.user_id = auth.uid()));

create policy "members read own bonuses" on public.org_referral_bonuses
  for select to authenticated
  using (exists (select 1 from public.org_memberships m
                 where m.organization_id = org_referral_bonuses.organization_id
                   and m.user_id = auth.uid()));

insert into public.org_referral_codes (organization_id, code)
select o.id,
       (select string_agg(
                 substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                        1 + (('x' || substr(md5(o.id::text), 1 + i*2, 2))::bit(8)::int % 32),
                        1),
                 '' order by i)
        from generate_series(0, 7) i)
from public.organizations o
where o.plan_type is distinct from 'lifetime'
on conflict (organization_id) do nothing;