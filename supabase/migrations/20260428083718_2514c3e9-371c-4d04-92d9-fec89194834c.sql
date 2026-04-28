
-- Helper RPCs to set/update the cron_secret vault entry (called by internal sync edge function only).
CREATE OR REPLACE FUNCTION public.vault_create_cron_secret(p_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT vault.create_secret(p_value, 'cron_secret') INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_update_cron_secret(p_value text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'cron_secret' LIMIT 1;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'cron_secret');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, 'cron_secret');
  END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_create_cron_secret(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_update_cron_secret(text) FROM anon, authenticated;
