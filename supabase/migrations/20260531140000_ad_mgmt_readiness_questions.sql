-- Ad management onboarding visibility: capture which platform accounts
-- the customer already has so the operator knows what to CREATE vs
-- CONNECT during done-for-you setup.
--
-- The customer owns the accounts; ad spend bills directly to their card
-- with Google/Facebook (separate from the $400/mo management fee).
-- Most cleaning-business owners don't have these set up — we create
-- them during onboarding and hand ownership over.
--
-- Each column accepts 'yes' / 'no' / 'not_sure' so the onboarding admin
-- can tell the difference between "they confirmed they don't have it"
-- and "they're unsure and we need to verify with them."

ALTER TABLE public.ad_management_requests
  ADD COLUMN IF NOT EXISTS has_google_business TEXT
    CHECK (has_google_business IS NULL OR has_google_business IN ('yes','no','not_sure')),
  ADD COLUMN IF NOT EXISTS has_google_ads TEXT
    CHECK (has_google_ads IS NULL OR has_google_ads IN ('yes','no','not_sure')),
  ADD COLUMN IF NOT EXISTS has_lsa_verified TEXT
    CHECK (has_lsa_verified IS NULL OR has_lsa_verified IN ('yes','no','not_sure')),
  ADD COLUMN IF NOT EXISTS has_facebook_bm TEXT
    CHECK (has_facebook_bm IS NULL OR has_facebook_bm IN ('yes','no','not_sure'));
