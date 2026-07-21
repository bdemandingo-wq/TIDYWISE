-- Relax the leads.status check constraint so it matches the values used in the UI
-- (new, contacted, qualified, follow_up, quoted, commercial, converted, lost).
-- The old constraint rejected follow_up/quoted/commercial and caused failed updates.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'follow_up', 'quoted', 'commercial', 'converted', 'lost'));