-- Add column to track when tasks were last reset
ALTER TABLE public.tasks_and_notes 
ADD COLUMN IF NOT EXISTS last_reset_at DATE DEFAULT CURRENT_DATE;

-- Create function to reset daily tasks at midnight
CREATE OR REPLACE FUNCTION reset_daily_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tasks_and_notes
  SET is_completed = false, 
      last_reset_at = CURRENT_DATE,
      updated_at = now()
  WHERE type = 'daily'
    AND is_completed = true
    AND last_reset_at < CURRENT_DATE;
END;
$$;