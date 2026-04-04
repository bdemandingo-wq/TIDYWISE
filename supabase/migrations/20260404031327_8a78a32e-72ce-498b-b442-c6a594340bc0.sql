
ALTER TABLE public.booking_photos 
ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo';

-- Add validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_booking_photo_media_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.media_type NOT IN ('photo', 'video') THEN
    RAISE EXCEPTION 'Invalid media_type: %. Must be photo or video.', NEW.media_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_booking_photo_media_type
BEFORE INSERT OR UPDATE ON public.booking_photos
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_photo_media_type();
