create or replace function public.billing_payer_plan_types(p_org_ids uuid[])
returns table (organization_id uuid, plan_type text)
language sql
stable
security definer
set search_path = public
as $$
  -- SECURITY DEFINER because organizations' RLS has no platform-admin
  -- bypass, which is the whole bug. It therefore authorizes the caller
  -- itself: a non-platform-admin gets zero rows, not a cross-tenant read of
  -- who pays for TidyWise.
  select o.id, o.plan_type
  from public.organizations o
  where o.id = any(p_org_ids)
    and public.is_platform_admin();
$$;

revoke all on function public.billing_payer_plan_types(uuid[]) from public, anon;
grant execute on function public.billing_payer_plan_types(uuid[]) to authenticated;