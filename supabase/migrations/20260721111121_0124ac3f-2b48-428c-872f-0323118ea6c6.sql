
ALTER TABLE public.customers
  ALTER COLUMN referral_code SET DEFAULT upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
