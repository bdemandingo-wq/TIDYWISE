// Database-backed AI rate limiter using public.check_and_increment_ai_rate_limit.
//
// Enforces two limits atomically per call:
//   - per-org:  200 requests / 1 hour
//   - per-user: 30 requests  / 1 minute
//
// On limit, returns a Response with 429 + Retry-After header. Otherwise returns null.
//
// Usage in an edge function (after auth + org resolution):
//
//   const limited = await enforceAiRateLimit(supabase, { orgId, userId });
//   if (limited) return limited;

export const AI_RATE_LIMITS = {
  perOrg:  { limit: 200, windowSeconds: 3600 },
  perUser: { limit: 30,  windowSeconds: 60 },
};

interface RateCheckRow {
  allowed: boolean;
  current_count: number;
  limit_value: number;
  retry_after_seconds: number;
}

async function callCheck(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  scope: "org" | "user",
  scopeId: string,
  limit: number,
  windowSeconds: number,
): Promise<RateCheckRow | null> {
  const { data, error } = await supabase.rpc("check_and_increment_ai_rate_limit", {
    p_scope: scope,
    p_scope_id: scopeId,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`[ai-rate-limit] rpc failed (${scope}:${scopeId}):`, error.message);
    return null; // fail open on transient DB errors
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as RateCheckRow;
}

export async function enforceAiRateLimit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { orgId?: string | null; userId?: string | null; corsHeaders?: Record<string, string> },
): Promise<Response | null> {
  const cors = args.corsHeaders ?? {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const checks: Array<Promise<{ scope: string; row: RateCheckRow | null }>> = [];
  if (args.orgId) {
    checks.push(
      callCheck(supabase, "org", args.orgId, AI_RATE_LIMITS.perOrg.limit, AI_RATE_LIMITS.perOrg.windowSeconds)
        .then((row) => ({ scope: "organization", row })),
    );
  }
  if (args.userId) {
    checks.push(
      callCheck(supabase, "user", args.userId, AI_RATE_LIMITS.perUser.limit, AI_RATE_LIMITS.perUser.windowSeconds)
        .then((row) => ({ scope: "user", row })),
    );
  }
  if (checks.length === 0) return null;

  const results = await Promise.all(checks);
  const blocked = results.find((r) => r.row && r.row.allowed === false);
  if (!blocked || !blocked.row) return null;

  const retry = Math.max(1, blocked.row.retry_after_seconds);
  const message = `You're sending requests too fast — try again in ${retry} second${retry === 1 ? "" : "s"}.`;
  return new Response(
    JSON.stringify({
      error: message,
      code: "rate_limited",
      scope: blocked.scope,
      retryAfterSeconds: retry,
      limit: blocked.row.limit_value,
    }),
    {
      status: 429,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Retry-After": String(retry),
      },
    },
  );
}
