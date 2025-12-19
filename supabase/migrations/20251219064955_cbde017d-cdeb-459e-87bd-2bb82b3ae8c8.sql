-- Add new columns to bookings table for enhanced booking form
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS frequency text DEFAULT 'one_time',
ADD COLUMN IF NOT EXISTS bedrooms text DEFAULT '1',
ADD COLUMN IF NOT EXISTS bathrooms text DEFAULT '1',
ADD COLUMN IF NOT EXISTS square_footage text,
ADD COLUMN IF NOT EXISTS extras jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS apt_suite text,
ADD COLUMN IF NOT EXISTS is_draft boolean DEFAULT false;