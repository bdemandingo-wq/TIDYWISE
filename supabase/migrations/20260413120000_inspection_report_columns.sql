-- Add property inspection columns to booking_photos
-- Used for Airbnb/STR cleaners to report broken, missing, or low inventory items

ALTER TABLE booking_photos
  ADD COLUMN IF NOT EXISTS inspection_note TEXT,
  ADD COLUMN IF NOT EXISTS issue_category TEXT CHECK (
    issue_category IS NULL OR
    issue_category = ANY (ARRAY['broken', 'missing', 'low_inventory', 'general'])
  );

-- Extend the photo_type constraint to allow 'inspection'
ALTER TABLE booking_photos
  DROP CONSTRAINT IF EXISTS booking_photos_photo_type_check;

ALTER TABLE booking_photos
  ADD CONSTRAINT booking_photos_photo_type_check
  CHECK (photo_type = ANY (ARRAY['before'::text, 'after'::text, 'other'::text, 'inspection'::text]));
