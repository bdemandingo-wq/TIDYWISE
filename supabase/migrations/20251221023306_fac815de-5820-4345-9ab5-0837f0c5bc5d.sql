-- Enable realtime for bookings table
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- Enable realtime for customers table
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;