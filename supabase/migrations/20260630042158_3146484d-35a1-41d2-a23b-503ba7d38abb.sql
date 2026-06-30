-- Grant Clean Collective lifetime access
INSERT INTO public.lifetime_access_purchases (email, user_id, organization_id, amount_cents)
VALUES ('cleancollectivepro@gmail.com', 'fd3499be-a88a-4825-8cd2-a492d46d4565', '0ddb3567-4641-48c8-8ff7-4bf1b87681da', 0);

UPDATE public.organizations SET plan_type='lifetime' WHERE id='0ddb3567-4641-48c8-8ff7-4bf1b87681da';