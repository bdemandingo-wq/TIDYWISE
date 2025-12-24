-- Add sent_at to review_requests if not exists and add link tracking
ALTER TABLE public.review_requests 
ADD COLUMN IF NOT EXISTS review_link_token TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS google_review_url TEXT;