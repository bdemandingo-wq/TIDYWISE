ALTER TABLE public.booking_photos
DROP CONSTRAINT IF EXISTS booking_photos_photo_type_check;

ALTER TABLE public.booking_photos
ADD CONSTRAINT booking_photos_photo_type_check
CHECK (photo_type = ANY (ARRAY['before'::text, 'after'::text, 'other'::text]));