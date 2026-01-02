-- Add new columns for monthly goals and net profit goal percent
ALTER TABLE public.pnl_settings 
ADD COLUMN IF NOT EXISTS net_profit_goal_percent numeric DEFAULT 20,
ADD COLUMN IF NOT EXISTS monthly_first_time_goals jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS monthly_recurring_goals jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS monthly_fixed_cost_goals jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS target_cpl numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS target_cpa numeric DEFAULT 0;