
-- Fix rebooking_reminder_queue: The "Service role manages" policy allows ALL operations for public role with true.
-- Service role bypasses RLS anyway, so this policy is redundant AND dangerous.
-- Replace with org-scoped policies for authenticated users.
DROP POLICY IF EXISTS "Service role manages rebooking reminders" ON public.rebooking_reminder_queue;

-- Only org members can insert/update/delete
CREATE POLICY "Org members can manage rebooking reminders"
  ON public.rebooking_reminder_queue
  FOR ALL
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- Fix short_urls: INSERT should require authentication
DROP POLICY IF EXISTS "Authenticated users can create short URLs" ON public.short_urls;
CREATE POLICY "Authenticated users can create short URLs"
  ON public.short_urls
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
