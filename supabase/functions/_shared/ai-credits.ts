// Per-organization AI credit consumer.
//
// Atomically consumes 1 AI credit via the `consume_ai_credit(org)` RPC:
//   - Daily free allowance first (varies by plan_tier: trial=10, basic=25, pro=100, custom=250)
//   - Then purchased balance from ai_credit_ledger
//   - Denied attempts are rolled back so they don't burn a credit
//
// Runs AFTER the per-minute rate limiter, BEFORE the AI Gateway call.
//
// Usage:
//   const denied = await enforceAiCredit(supabase, { orgId, corsHeaders });
//   if (denied) return denied;

export interface AiCreditStatus {
  allowed: boolean;
  used_today: number;
  daily_limit: number;
  purchased_balance: number;
  resets_at: string;      // ISO timestamp (UTC)
  source: "daily" | "purchased" | "none";
}

export async function enforceAiCredit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { orgId: string; corsHeaders?: Record<string, string> },
): Promise<Response | null> {
  const cors = args.corsHeaders ?? {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (!args.orgId) {
    console.error("[ai-credits] missing orgId — refusing to spend credits");
    return new Response(
      JSON.stringify({ error: "organization_id required for AI credit accounting" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const { data, error } = await supabase.rpc("consume_ai_credit", { _org_id: args.orgId });
  if (error) {
    console.error(`[ai-credits] rpc failed for org ${args.orgId}:`, error.message);
    // Fail OPEN on transient DB errors so a Postgres blip doesn't lock everyone
    // out of AI. The per-minute rate limiter is still enforcing an upper bound.
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as AiCreditStatus | undefined;
  if (!row) return null;

  if (row.allowed) return null;

  // 402 payload — the frontend recognises this shape and shows the buy modal.
  return new Response(
    JSON.stringify({
      error: "daily_limit_reached",
      code: "daily_limit_reached",
      message:
        `You've used today's free AI actions (${row.used_today}/${row.daily_limit}). ` +
        `Resets at midnight UTC — or buy 500 credits for $10 to keep going.`,
      used: row.used_today,
      limit: row.daily_limit,
      purchasedBalance: row.purchased_balance,
      resetsAt: row.resets_at,
    }),
    {
      status: 402,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
}
