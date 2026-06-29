ALTER TABLE public.booking_photos
  ADD COLUMN IF NOT EXISTS inspection_note text,
  ADD COLUMN IF NOT EXISTS issue_category text;