GRANT INSERT ON public.demo_bookings TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.demo_bookings TO authenticated;
GRANT ALL ON public.demo_bookings TO service_role;

GRANT INSERT ON public.demo_requests TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.demo_requests TO authenticated;
GRANT ALL ON public.demo_requests TO service_role;