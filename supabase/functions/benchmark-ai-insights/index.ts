import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    if (!membership) return json({ error: "forbidden" }, 403);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "ai_not_configured" }, 500);

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

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (aiRes.status === 429) {
      return json({ error: "rate_limited" }, 429);
    }
    if (aiRes.status === 402) {
      return json({ error: "credits_exhausted" }, 402);
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("ai gateway error", aiRes.status, t);
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

    return json({ insights: Array.isArray(parsed.insights) ? parsed.insights : [] });
  } catch (e) {
    console.error("benchmark-ai-insights error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
