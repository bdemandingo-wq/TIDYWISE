revoke all on public.billing_revenue_by_confidence from anon, authenticated, service_role;
revoke all on public.billing_plan_payers from anon, authenticated, service_role;

grant select on public.billing_revenue_by_confidence to authenticated, service_role;
grant select on public.billing_plan_payers to authenticated, service_role;