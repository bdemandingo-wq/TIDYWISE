-- Fix: demo booking form was crashing because it INSERTs a 'notes'
-- column on demo_bookings that never existed in any prior migration.
-- The booking dialog captures an optional "Anything specific you'd
-- like to discuss?" textarea and tries to persist it here.
--
-- Schema mismatch raised PGRST204 ("Could not find the 'notes' column
-- of 'demo_bookings'") which the form caught and translated to a
-- generic "Something went wrong" toast — so every demo booking
-- submission silently failed.
--
-- Idempotent so this is safe to apply against any project state.

ALTER TABLE public.demo_bookings
  ADD COLUMN IF NOT EXISTS notes TEXT;
