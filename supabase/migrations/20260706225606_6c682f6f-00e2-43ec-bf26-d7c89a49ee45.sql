
CREATE TABLE public.ai_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('org','user')),
  scope_id UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id, window_seconds, window_start)
);

CREATE INDEX idx_ai_rate_limits_lookup ON public.ai_rate_limits (scope, scope_id, window_seconds, window_start DESC);
CREATE INDEX idx_ai_rate_limits_cleanup ON public.ai_rate_limits (window_start);

GRANT ALL ON public.ai_rate_limits TO service_role;
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only service_role (edge functions) touches this table via RPC.

-- Atomic increment-and-check RPC. Bucketed windows: window_start is floor(now / window_seconds).
-- Returns whether the request is allowed, current count, limit, and seconds until window resets.
CREATE OR REPLACE FUNCTION public.check_and_increment_ai_rate_limit(
  p_scope TEXT,
  p_scope_id UUID,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, limit_value INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_epoch BIGINT;
  v_count INTEGER;
BEGIN
  IF p_scope NOT IN ('org','user') THEN
    RAISE EXCEPTION 'invalid scope: %', p_scope;
  END IF;

  v_epoch := EXTRACT(EPOCH FROM now())::BIGINT;
  v_window_start := to_timestamp((v_epoch / p_window_seconds) * p_window_seconds);

  INSERT INTO public.ai_rate_limits (scope, scope_id, window_start, window_seconds, request_count)
  VALUES (p_scope, p_scope_id, v_window_start, p_window_seconds, 1)
  ON CONFLICT (scope, scope_id, window_seconds, window_start)
  DO UPDATE SET request_count = public.ai_rate_limits.request_count + 1,
                updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN QUERY SELECT
    (v_count <= p_limit) AS allowed,
    v_count AS current_count,
    p_limit AS limit_value,
    GREATEST(1, p_window_seconds - (v_epoch - EXTRACT(EPOCH FROM v_window_start)::BIGINT))::INTEGER AS retry_after_seconds;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_ai_rate_limit(TEXT, UUID, INTEGER, INTEGER) TO service_role;

-- Daily cleanup: remove counter rows whose window ended more than 1 day ago.
CREATE OR REPLACE FUNCTION public.cleanup_ai_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.ai_rate_limits
  WHERE window_start + make_interval(secs => window_seconds) < now() - interval '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_ai_rate_limits() TO service_role;
