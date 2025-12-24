
-- Create function to award loyalty points when booking is completed
CREATE OR REPLACE FUNCTION public.award_loyalty_points()
RETURNS TRIGGER AS $$
DECLARE
  points_to_award INTEGER;
  existing_loyalty_id UUID;
  current_points INTEGER;
  current_lifetime INTEGER;
  new_tier TEXT;
BEGIN
  -- Only process if status changed to 'completed' and there's a customer
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    -- Calculate points: 1 point per dollar spent
    points_to_award := FLOOR(NEW.total_amount);
    
    -- Check if customer has loyalty record
    SELECT id, points, lifetime_points INTO existing_loyalty_id, current_points, current_lifetime
    FROM public.customer_loyalty
    WHERE customer_id = NEW.customer_id;
    
    IF existing_loyalty_id IS NULL THEN
      -- Create new loyalty record
      current_points := 0;
      current_lifetime := 0;
      
      INSERT INTO public.customer_loyalty (customer_id, points, lifetime_points, tier)
      VALUES (NEW.customer_id, points_to_award, points_to_award, 'bronze')
      RETURNING id INTO existing_loyalty_id;
    ELSE
      -- Update existing loyalty record
      current_points := COALESCE(current_points, 0) + points_to_award;
      current_lifetime := COALESCE(current_lifetime, 0) + points_to_award;
      
      -- Calculate new tier based on lifetime points
      IF current_lifetime >= 5000 THEN
        new_tier := 'platinum';
      ELSIF current_lifetime >= 2000 THEN
        new_tier := 'gold';
      ELSIF current_lifetime >= 500 THEN
        new_tier := 'silver';
      ELSE
        new_tier := 'bronze';
      END IF;
      
      UPDATE public.customer_loyalty
      SET points = current_points,
          lifetime_points = current_lifetime,
          tier = new_tier,
          updated_at = now()
      WHERE id = existing_loyalty_id;
    END IF;
    
    -- Create loyalty transaction record
    INSERT INTO public.loyalty_transactions (customer_id, booking_id, points, transaction_type, description)
    VALUES (NEW.customer_id, NEW.id, points_to_award, 'earned', 'Points earned from booking #' || NEW.booking_number);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS award_loyalty_points_trigger ON public.bookings;
CREATE TRIGGER award_loyalty_points_trigger
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.award_loyalty_points();
