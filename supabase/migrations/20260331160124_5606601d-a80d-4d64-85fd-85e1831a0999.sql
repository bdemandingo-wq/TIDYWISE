
-- Add metadata column to sms_conversations for AI tracking
ALTER TABLE public.sms_conversations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Create trigger to auto-mark ai_converted on new bookings
CREATE OR REPLACE FUNCTION public.check_ai_conversion_on_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conv_id uuid;
  v_customer_phone text;
BEGIN
  -- Only check new bookings
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get customer phone
  SELECT phone INTO v_customer_phone
  FROM public.customers
  WHERE id = NEW.customer_id;

  IF v_customer_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if there's an AI-engaged conversation with this customer in the last 72 hours
  SELECT id INTO v_conv_id
  FROM public.sms_conversations
  WHERE organization_id = NEW.organization_id
    AND customer_phone = v_customer_phone
    AND metadata->>'ai_engaged' = 'true'
    AND (metadata->>'ai_last_reply_at')::timestamptz > (now() - interval '72 hours')
  ORDER BY last_message_at DESC
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    NEW.ai_converted := true;
    NEW.ai_source_conversation_id := v_conv_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_check_ai_conversion ON public.bookings;
CREATE TRIGGER trg_check_ai_conversion
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_ai_conversion_on_booking();
