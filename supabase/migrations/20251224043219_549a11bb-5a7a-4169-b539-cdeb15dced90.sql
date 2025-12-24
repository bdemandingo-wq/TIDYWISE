-- Add percentage_rate column to staff table for percentage-based pay
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS percentage_rate numeric DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.staff.percentage_rate IS 'Percentage of job total the staff member earns (e.g., 50 for 50%)';