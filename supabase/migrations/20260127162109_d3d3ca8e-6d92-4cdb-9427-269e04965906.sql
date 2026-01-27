-- Add default_hours column to staff table for pay calculations
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS default_hours numeric DEFAULT 5;

-- Add comment for documentation
COMMENT ON COLUMN public.staff.default_hours IS 'Default hours used for pay calculations per job when not using check-in/out times';