insert into public.organization_email_settings (organization_id, from_name, from_email, email_send_method)
values ('8b27d28d-17ad-4c23-8536-33ce81cdfd1d','Tester Cleaning Company','bookings@unverified-domain-notify-test.example','resend')
on conflict (organization_id) do update set from_name=excluded.from_name, from_email=excluded.from_email, email_send_method=excluded.email_send_method;