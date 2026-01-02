-- Add new goal columns to pnl_settings table
ALTER TABLE public.pnl_settings 
ADD COLUMN IF NOT EXISTS goal_repeat_revenue_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS goal_first_time_revenue_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS fixed_cost_goal numeric DEFAULT 0;