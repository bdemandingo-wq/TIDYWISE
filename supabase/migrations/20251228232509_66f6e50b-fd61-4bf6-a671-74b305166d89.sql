-- Create a function to send welcome email when a new user signs up
CREATE OR REPLACE FUNCTION public.send_welcome_email_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  -- Get Supabase URL
  supabase_url := 'https://slwfkaqczvwvvvavkgpr.supabase.co';
  
  -- Use pg_net to call the edge function asynchronously
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'email', NEW.email,
      'fullName', NEW.raw_user_meta_data ->> 'full_name',
      'userId', NEW.id::text
    )
  );
  
  RAISE LOG 'Welcome email queued for new user %', NEW.email;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE LOG 'Error in send_welcome_email_on_signup: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger to send welcome email after user signup
DROP TRIGGER IF EXISTS on_auth_user_created_welcome_email ON auth.users;

CREATE TRIGGER on_auth_user_created_welcome_email
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.send_welcome_email_on_signup();