update public.billing_events b
set counts_as_cash   = false,
    correction_basis = coalesce(b.correction_basis || ' | ', '')
      || 'counts_as_cash=false 2026-08-05: not TidyWise subscription revenue. '
      || 'Clean Collective - founder co-venture, money moving between his own businesses.',
    corrected_at     = now()
from public.organizations o
where o.id = b.organization_id
  and o.name = 'Clean Collective'
  and b.counts_as_cash
  and coalesce(b.revenue_stream_corrected, b.revenue_stream) = 'plan';