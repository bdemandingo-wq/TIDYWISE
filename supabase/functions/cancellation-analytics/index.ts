// Platform-admin only — aggregated churn / retention analytics.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_EMAIL = "support@tidywisecleaning.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const email = userData?.user?.email?.toLowerCase();
    if (email !== PLATFORM_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Platform admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const days = Number(body?.days ?? 90);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString();

    const [{ data: feedback }, { data: pauses }, { data: offers }] = await Promise.all([
      supabase
        .from("cancellation_feedback")
        .select("reason, competitor_name, missing_feature, feedback_text, canceled_at, eligible_for_winback")
        .gte("canceled_at", sinceIso),
      supabase
        .from("subscription_pauses")
        .select("pause_months, status, paused_at")
        .gte("paused_at", sinceIso),
      supabase
        .from("winback_offers")
        .select("status, shown_at")
        .gte("shown_at", sinceIso),
    ]);

    const reasonCounts: Record<string, number> = {};
    const competitors: { name: string; count: number }[] = [];
    const competitorMap: Record<string, number> = {};
    const missingFeatures: { feature: string; count: number }[] = [];
    const featureMap: Record<string, number> = {};
    const recentFeedback: { reason: string; text: string; canceled_at: string }[] = [];

    for (const f of feedback ?? []) {
      reasonCounts[f.reason] = (reasonCounts[f.reason] ?? 0) + 1;
      if (f.competitor_name?.trim()) {
        const k = f.competitor_name.trim();
        competitorMap[k] = (competitorMap[k] ?? 0) + 1;
      }
      if (f.missing_feature?.trim()) {
        const k = f.missing_feature.trim();
        featureMap[k] = (featureMap[k] ?? 0) + 1;
      }
      if (f.feedback_text?.trim()) {
        recentFeedback.push({
          reason: f.reason,
          text: f.feedback_text,
          canceled_at: f.canceled_at,
        });
      }
    }
    for (const [name, count] of Object.entries(competitorMap)) {
      competitors.push({ name, count });
    }
    competitors.sort((a, b) => b.count - a.count);
    for (const [feature, count] of Object.entries(featureMap)) {
      missingFeatures.push({ feature, count });
    }
    missingFeatures.sort((a, b) => b.count - a.count);
    recentFeedback.sort((a, b) => (a.canceled_at < b.canceled_at ? 1 : -1));

    const pauseDurations: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
    let activePauses = 0;
    let resumedPauses = 0;
    for (const p of pauses ?? []) {
      pauseDurations[String(p.pause_months)] =
        (pauseDurations[String(p.pause_months)] ?? 0) + 1;
      if (p.status === "active") activePauses++;
      if (p.status === "resumed") resumedPauses++;
    }

    const winback = { shown: 0, claimed: 0, declined: 0 };
    for (const o of offers ?? []) {
      if (o.status === "claimed") winback.claimed++;
      else if (o.status === "declined") winback.declined++;
      else winback.shown++;
    }

    return new Response(
      JSON.stringify({
        window_days: days,
        total_cancellations: feedback?.length ?? 0,
        reason_counts: reasonCounts,
        competitors,
        missing_features: missingFeatures,
        recent_feedback: recentFeedback.slice(0, 25),
        pauses: {
          total: pauses?.length ?? 0,
          active: activePauses,
          resumed: resumedPauses,
          by_duration_months: pauseDurations,
        },
        winback,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[CANCEL-ANALYTICS] ERROR", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
