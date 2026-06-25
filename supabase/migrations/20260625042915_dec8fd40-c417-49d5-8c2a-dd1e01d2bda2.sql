
ALTER TABLE public.profiles ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at, subscription_status, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW(),
    NOW(),
    'trial',
    NOW() + interval '7 days'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

UPDATE public.profiles
SET trial_ends_at = created_at + interval '7 days'
WHERE trial_ends_at IS NULL
  AND subscription_status = 'trial';
