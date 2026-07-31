CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, created_at, updated_at, subscription_status, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(TRIM(CONCAT_WS(' ', NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name')), '')
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'phone', ''),
      NULLIF(NEW.raw_user_meta_data->>'phone_number', '')
    ),
    NOW(),
    NOW(),
    'trial',
    NOW() + interval '14 days'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Backfill names and phones that were never copied (trial_ends_at untouched)
UPDATE public.profiles p
SET full_name = COALESCE(p.full_name, NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')),'')),
    phone     = COALESCE(p.phone, NULLIF(u.raw_user_meta_data->>'phone',''), NULLIF(u.raw_user_meta_data->>'phone_number','')),
    updated_at = now()
FROM auth.users u
WHERE u.id = p.id
  AND (
    (p.full_name IS NULL AND COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(u.raw_user_meta_data->>'name',''), NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')),'')) IS NOT NULL)
    OR
    (p.phone IS NULL AND COALESCE(NULLIF(u.raw_user_meta_data->>'phone',''), NULLIF(u.raw_user_meta_data->>'phone_number','')) IS NOT NULL)
  );