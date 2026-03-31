
-- Add ai_converted tracking to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ai_converted boolean DEFAULT false;

-- Add ai_source_conversation_id to track which AI conversation led to the booking
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ai_source_conversation_id uuid;
