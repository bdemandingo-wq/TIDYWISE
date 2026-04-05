-- Drop the OLD overload (6-param, without p_location_id) that causes ambiguity
DROP FUNCTION IF EXISTS public.submit_client_booking_request(uuid, uuid, uuid, timestamptz, uuid, text);
