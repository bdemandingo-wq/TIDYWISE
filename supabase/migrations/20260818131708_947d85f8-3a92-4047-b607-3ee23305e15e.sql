UPDATE public.billing_events
SET counts_as_cash = false,
    description = coalesce(description || ' | ', '') || 'non-cash: duplicate of charge ch_3U451HJv857o86no1WUFSbWA (same $49 Open Arms payment)'
WHERE id = '8b40bd9e-8210-4efc-8a67-cfffa1303899';

UPDATE public.billing_events
SET counts_as_cash = false,
    description = coalesce(description || ' | ', '') || 'non-cash: duplicate of credits.purchased event cb3c76a3-02f3-4523-9da0-b613c9241179 (same $10 AI credit top-up)'
WHERE id = '0ad0bacc-6de0-4c5e-9f4d-30013ce23ac4';