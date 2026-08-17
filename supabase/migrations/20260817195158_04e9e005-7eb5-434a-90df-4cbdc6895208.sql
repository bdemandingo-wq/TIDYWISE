alter table public.org_referrals
  add column if not exists referred_discount_applied_at timestamptz;

create table if not exists public.org_referral_redemptions (
  stripe_invoice_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coupon_id text,
  redeemed_at timestamptz not null default now()
);

grant select on public.org_referral_redemptions to authenticated;
grant all on public.org_referral_redemptions to service_role;

alter table public.org_referral_redemptions enable row level security;

create policy "Org members can view their referral redemptions"
  on public.org_referral_redemptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = org_referral_redemptions.organization_id
        and m.user_id = auth.uid()
    )
  );