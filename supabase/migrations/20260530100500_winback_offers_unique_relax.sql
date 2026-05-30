-- Relax winback_offers.UNIQUE(user_id) to "one ACTIVE (status='shown')
-- offer per user", allowing historical claimed/declined rows to coexist
-- with a fresh offer later. The original constraint enforced "one
-- offer per user, ever" — which permanently disqualified a returning
-- customer who came back, cancelled again, and would otherwise
-- benefit from a new retention offer. The hard ban also meant any
-- future policy change ("one offer per cancellation event") required
-- a migration; this partial-index shape supports both policies.

ALTER TABLE public.winback_offers
  DROP CONSTRAINT IF EXISTS winback_offers_user_id_key;

-- Defense in depth: allow only one offer in the "shown" (not yet
-- responded to) state per user at a time. Claimed and declined rows
-- accumulate freely and form the user's offer history.
CREATE UNIQUE INDEX IF NOT EXISTS winback_offers_one_active_per_user
  ON public.winback_offers(user_id)
  WHERE status = 'shown';
