-- Add email templates to business_settings table
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS confirmation_email_subject TEXT DEFAULT 'Your Booking Confirmation - {{booking_number}}',
ADD COLUMN IF NOT EXISTS confirmation_email_body TEXT DEFAULT 'Hi {{customer_name}},

Thank you for booking with us!

Your booking details:
- Booking #: {{booking_number}}
- Service: {{service_name}}
- Date: {{scheduled_date}}
- Time: {{scheduled_time}}
- Address: {{address}}
- Total: ${{total_amount}}

We look forward to serving you!

Best regards,
{{company_name}}',
ADD COLUMN IF NOT EXISTS reminder_email_subject TEXT DEFAULT 'Reminder: Your Cleaning is Tomorrow - {{booking_number}}',
ADD COLUMN IF NOT EXISTS reminder_email_body TEXT DEFAULT 'Hi {{customer_name}},

This is a friendly reminder that your cleaning is scheduled for tomorrow.

Booking Details:
- Booking #: {{booking_number}}
- Service: {{service_name}}
- Date: {{scheduled_date}}
- Time: {{scheduled_time}}
- Address: {{address}}

If you need to reschedule or have any questions, please contact us.

See you soon!
{{company_name}}';