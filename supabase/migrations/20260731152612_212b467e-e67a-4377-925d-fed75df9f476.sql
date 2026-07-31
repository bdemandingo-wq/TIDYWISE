GRANT SELECT ON public.billing_backfill_jobs TO authenticated;

ALTER VIEW public.billing_monthly_summary SET (security_invoker = true);