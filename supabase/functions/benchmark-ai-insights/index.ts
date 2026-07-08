import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { anthropicChat, MODEL_SONNET } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ServiceMetric {
  service_bucket: string;
  bookings_count?: number | null;
  avg_price?: number | null;
  cancel_rate?: number | null;
  noshow_rate?: number | null;
  repeat_rate?: number | null;
  review_rate?: number | null;
  avg_rating?: number | null;
  recurring_share?: number | null;
}

interface PeerSnapshot {
  service_bucket: string;
  org_count?: number | null;
  avg_price?: number | null;
  median_price?: number | null;
  p25_price?: number | null;
  p75_price?: number | null;
  cancel_rate?: number | null;
  noshow_rate?: number | null;
  repeat_rate?: number | null;
  review_rate?: number | null;
  avg_rating?: number | null;
  recurring_share?: number | null;
}

interface Body {
  org_id: string;
  cohort: "local" | "regional" | "national";
  my_metrics: ServiceMetric[];
  peer_metrics: PeerSnapshot[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  // Service role client used only for audit logging
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const audit = async (
    orgId: string | null,
    status: "success" | "error" | "skipped",
    metadata: Record<string, unknown>,
    errorCode?: string | null,
  ) => {
    try {
      await admin.rpc("log_benchmark_event", {
        p_organization_id: orgId,
        p_event_type: status === "skipped" ? "blocked_opt_out" : "ai_insights",
        p_status: status,
        p_duration_ms: Date.now() - startedAt,
        p_metadata: metadata,
        p_error_code: errorCode ?? null,
      });
    } catch (_) { /* never throw from audit */ }
  };

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body: Body = await req.json().catch(() => ({} as Body));
    if (!body?.org_id || !Array.isArray(body.my_metrics)) {
      return json({ error: "invalid_body" }, 400);
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("organization_id", body.org_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) {
      await audit(body.org_id, "error", { reason: "forbidden" }, "forbidden");
      return json({ error: "forbidden" }, 403);
    }

    // Gate on benchmarks_opt_in
    const { data: bs } = await admin
      .from("business_settings")
      .select("benchmarks_opt_in")
      .eq("organization_id", body.org_id)
      .maybeSingle();

    if (!bs || bs.benchmarks_opt_in !== true) {
      await audit(body.org_id, "skipped", {
        reason: "opt_out",
        cohort: body.cohort,
      });
      return json({ error: "benchmarks_opt_out" }, 403);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      await audit(body.org_id, "error", { cohort: body.cohort }, "ai_not_configured");
      return json({ error: "ai_not_configured" }, 500);
    }

    const systemPrompt =
      `You are a no-nonsense business advisor for cleaning company owners. ` +
      `You receive the owner's last-90-days metrics and anonymous peer aggregates ` +
      `(${body.cohort} cohort). Generate 3-5 short, ACTIONABLE insights. ` +
      `Each insight: a punchy title (max 8 words), a 1-2 sentence body grounded in the actual numbers ` +
      `(quote the % difference and dollar impact when relevant), a severity ('opportunity' | 'warning' | 'good'), ` +
      `and a single concrete suggested_action the owner can take this week. ` +
      `Be honest about wins too. Never invent numbers. Reply ONLY as compact JSON: ` +
      `{"insights":[{"title":"","body":"","severity":"","suggested_action":""}]}`;

    const userPayload = {
      cohort: body.cohort,
      my_metrics: body.my_metrics,
      peer_metrics: body.peer_metrics,
    };

    const aiRes = await anthropicChat(
      {
        model: MODEL_SONNET,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      },
      { corsHeaders },
    );

    if (aiRes.status === 429) {
      await audit(body.org_id, "error", { cohort: body.cohort }, "rate_limited");
      return json({ error: "rate_limited" }, 429);
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("anthropic error", aiRes.status, t);
      await audit(body.org_id, "error", { cohort: body.cohort, http: aiRes.status }, "ai_error");
      return json({ error: "ai_error" }, 502);
    }


    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { insights?: unknown[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { insights: [] };
    }

    const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
    await audit(body.org_id, "success", {
      cohort: body.cohort,
      insights_count: insights.length,
      my_metric_buckets: body.my_metrics.length,
      peer_metric_buckets: body.peer_metrics?.length ?? 0,
    });

    return json({ insights });
  } catch (e) {
    console.error("benchmark-ai-insights error", e);
    await audit(null, "error", {}, (e as Error).message?.slice(0, 200));
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
