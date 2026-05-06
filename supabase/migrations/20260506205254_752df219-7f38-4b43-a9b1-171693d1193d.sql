INSERT INTO public.organization_automations (organization_id, automation_type, is_enabled, description)
SELECT
  o.id,
  a.automation_type,
  false,
  a.description
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('seasonal_promo', 'Sends promo SMS 3 days before major US holidays'),
    ('weekly_summary', 'Emails a weekly business digest every Monday'),
    ('recurring_lapse_alert', 'Alerts when a recurring booking did not generate'),
    ('quote_stale_reengage', 'Auto-follows up on quotes sitting unbooked for 3 days')
) AS a(automation_type, description)
ON CONFLICT (organization_id, automation_type) DO NOTHING;