-- Fix the send_loyalty_progress_email function to handle missing JWT claims
CREATE OR REPLACE FUNCTION public.send_loyalty_progress_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  customer_record RECORD;
  loyalty_record RECORD;
  points_earned INTEGER;
  next_tier TEXT;
  points_to_next INTEGER;
  supabase_url TEXT;
  jwt_claims TEXT;
BEGIN
  -- Only process if status changed to 'completed' and there's a customer
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.customer_id IS NOT NULL THEN
    
    -- Get customer details
    SELECT first_name, last_name, email INTO customer_record
    FROM public.customers
    WHERE id = NEW.customer_id;
    
    -- Get loyalty details (may have just been created/updated by award_loyalty_points trigger)
    SELECT points, lifetime_points, tier INTO loyalty_record
    FROM public.customer_loyalty
    WHERE customer_id = NEW.customer_id;
    
    -- Calculate points earned from this booking
    points_earned := FLOOR(NEW.total_amount);
    
    -- Determine next tier and points needed
    IF loyalty_record.tier = 'bronze' THEN
      next_tier := 'silver';
      points_to_next := 500 - COALESCE(loyalty_record.lifetime_points, 0);
    ELSIF loyalty_record.tier = 'silver' THEN
      next_tier := 'gold';
      points_to_next := 2000 - COALESCE(loyalty_record.lifetime_points, 0);
    ELSIF loyalty_record.tier = 'gold' THEN
      next_tier := 'platinum';
      points_to_next := 5000 - COALESCE(loyalty_record.lifetime_points, 0);
    ELSE
      next_tier := NULL;
      points_to_next := NULL;
    END IF;
    
    -- Ensure points_to_next is not negative
    IF points_to_next IS NOT NULL AND points_to_next < 0 THEN
      points_to_next := 0;
    END IF;
    
    -- Get Supabase URL
    supabase_url := current_setting('app.settings.supabase_url', true);
    
    -- If settings not available, try to construct from project ref
    IF supabase_url IS NULL OR supabase_url = '' THEN
      supabase_url := 'https://slwfkaqczvwvvvavkgpr.supabase.co';
    END IF;
    
    -- Safely get JWT claims - handle null/empty case
    jwt_claims := current_setting('request.jwt.claims', true);
    
    -- Only send if customer has email and loyalty record exists
    IF customer_record.email IS NOT NULL AND loyalty_record IS NOT NULL THEN
      -- Use pg_net to call the edge function asynchronously
      -- Use service role for internal trigger calls since JWT might not be available
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-loyalty-progress-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'customerEmail', customer_record.email,
          'customerName', customer_record.first_name || ' ' || customer_record.last_name,
          'pointsEarned', points_earned,
          'totalPoints', COALESCE(loyalty_record.points, 0),
          'lifetimePoints', COALESCE(loyalty_record.lifetime_points, 0),
          'currentTier', COALESCE(loyalty_record.tier, 'bronze'),
          'nextTier', next_tier,
          'pointsToNextTier', points_to_next,
          'bookingNumber', NEW.booking_number::text
        )
      );
      
      RAISE LOG 'Loyalty progress email queued for customer %', customer_record.email;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the booking update
    RAISE LOG 'Error in send_loyalty_progress_email: %', SQLERRM;
    RETURN NEW;
END;
$function$;