-- Restore admin/owner access for jigdahifash@gmail.com (user 5465449c-febb-4f68-b5af-f0b784db878b)
DELETE FROM public.user_roles WHERE user_id = '5465449c-febb-4f68-b5af-f0b784db878b' AND role = 'staff';
INSERT INTO public.user_roles (user_id, role) VALUES ('5465449c-febb-4f68-b5af-f0b784db878b', 'admin') ON CONFLICT (user_id, role) DO NOTHING;
UPDATE public.org_memberships SET role = 'owner' WHERE user_id = '5465449c-febb-4f68-b5af-f0b784db878b' AND organization_id = '683fa5c5-9211-48c9-87b2-3dfef1b4fbd1';