-- Create a function to handle booking cancellation requests from client portal
-- Non-platinum members cannot cancel within 48 hours (fee warning)
-- Platinum members can cancel anytime

CREATE OR REPLACE FUNCTION public.client_cancel_booking(
  p_booking_id UUID,
  p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_loyalty RECORD;
  v_hours_until_booking NUMERIC;
  v_is_platinum BOOLEAN;
BEGIN
  -- Get the booking and verify ownership
  SELECT b.*, c.id as customer_id_check
  INTO v_booking
  FROM bookings b
  JOIN customers c ON b.customer_id = c.id
  WHERE b.id = p_booking_id
    AND b.customer_id = p_customer_id
    AND b.status IN ('pending', 'confirmed');

  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found or cannot be cancelled');
  END IF;

  -- Calculate hours until booking
  v_hours_until_booking := EXTRACT(EPOCH FROM (v_booking.scheduled_at - NOW())) / 3600;

  -- Check if booking is in the past
  IF v_hours_until_booking < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel past bookings');
  END IF;

  -- Check loyalty tier
  SELECT tier INTO v_loyalty
  FROM customer_loyalty
  WHERE customer_id = p_customer_id;

  v_is_platinum := COALESCE(LOWER(v_loyalty.tier), 'bronze') = 'platinum';

  -- If not platinum and within 48 hours, deny cancellation
  IF NOT v_is_platinum AND v_hours_until_booking < 48 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Same day or next day cancellations may incur a fee. Please contact us directly to cancel.',
      'within_48_hours', true
    );
  END IF;

  -- Cancel the booking
  UPDATE bookings
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'message', 'Booking cancelled successfully');
END;
$$;