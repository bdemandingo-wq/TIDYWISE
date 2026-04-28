-- M6: Tighten storage bucket constraints — 10 MB cap + image MIME whitelist.
-- Affects existing 'booking-photos' bucket; creates 'supply-pictures' and 'work-photos' if missing.

-- 1. Tighten existing booking-photos bucket
UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'booking-photos';

-- 2. Ensure supply-pictures bucket exists with same constraints
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supply-pictures', 'supply-pictures', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

-- 3. Ensure work-photos bucket exists with same constraints
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('work-photos', 'work-photos', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];