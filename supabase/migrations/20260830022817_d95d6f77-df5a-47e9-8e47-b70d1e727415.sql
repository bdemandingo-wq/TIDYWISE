DROP INDEX IF EXISTS public.lifetime_access_purchases_session_uniq;
CREATE UNIQUE INDEX lifetime_access_purchases_session_uniq
  ON public.lifetime_access_purchases USING btree (stripe_session_id);