delete from public.organization_email_settings where organization_id='8b27d28d-17ad-4c23-8536-33ce81cdfd1d' and from_email='bookings@unverified-domain-notify-test.example';
delete from public.bookings where id in ('3270d8d8-290d-4194-b4ca-fc913837173a','a896c5c6-bb61-4b75-bb8b-c6cbf0226b53','f74003b7-95c1-4a2c-8441-b9064989fbac');
delete from public.leads where email in ('notify-verify-1@example.com','notify-verify-2@example.com','notify-verify-3@example.com');
delete from public.customers where email in ('notify-verify-1@example.com','notify-verify-2@example.com','notify-verify-3@example.com');
delete from public.system_logs where source='booking-notify' and details->>'booking_number' in ('1944','1945','1946');