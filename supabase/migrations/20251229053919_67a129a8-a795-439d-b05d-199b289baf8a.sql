-- Add SMS template for review requests to business_settings
ALTER TABLE public.business_settings 
ADD COLUMN IF NOT EXISTS review_sms_template TEXT DEFAULT 'Hi {customer_name}, thank you for choosing {company_name}! We''d love to hear about your experience. Please take a moment to leave us a review: {review_link}';