
ALTER TABLE public.recurring_bookings DROP CONSTRAINT recurring_bookings_staff_id_fkey;
ALTER TABLE public.recurring_bookings ADD CONSTRAINT recurring_bookings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT leads_assigned_to_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.staff(id) ON DELETE SET NULL;
