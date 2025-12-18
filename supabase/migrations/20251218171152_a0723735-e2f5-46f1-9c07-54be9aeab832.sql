-- Add missing columns to business_settings for all settings tabs
ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS allow_online_booking boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS require_deposit boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS minimum_notice_hours integer DEFAULT 24,
ADD COLUMN IF NOT EXISTS cancellation_window_hours integer DEFAULT 48,
ADD COLUMN IF NOT EXISTS notify_new_booking boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_reminders boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_cancellations boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_sms boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#3b82f6',
ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#14b8a6';