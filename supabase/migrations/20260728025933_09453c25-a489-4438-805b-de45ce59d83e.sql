ALTER TABLE public.staff REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;