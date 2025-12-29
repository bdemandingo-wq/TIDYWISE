-- Drop any triggers on auth.users that call the welcome email functions
DROP TRIGGER IF EXISTS on_auth_user_created_welcome_email ON auth.users;
DROP TRIGGER IF EXISTS send_welcome_email_trigger ON auth.users;
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON auth.users;

-- Also drop the problematic functions that use pg_net with potentially null URLs
DROP FUNCTION IF EXISTS public.send_welcome_email_on_signup() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_welcome_email() CASCADE;