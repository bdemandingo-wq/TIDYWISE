import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let source = "manual";
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.source === "string") source = body.source;
  } catch (_) { /* noop */ }

  try {
    const { data, error } = await supabase.rpc(
      "refresh_peer_benchmark_snapshots",
    );
    if (error) throw error;

    const duration = Date.now() - startedAt;

    // Audit: aggregate-only metadata, no per-org PII
    await supabase.rpc("log_benchmark_event", {
      p_organization_id: null,
      p_event_type: "refresh_snapshots",
      p_status: "success",
      p_duration_ms: duration,
      p_metadata: { snapshots_written: data ?? 0, source },
      p_error_code: null,
    });

    return new Response(
      JSON.stringify({ ok: true, snapshots_written: data, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const duration = Date.now() - startedAt;
    console.error("refresh-benchmark-snapshots error", e);
    try {
      const { error: logError } = await supabase.rpc("log_benchmark_event", {
        p_organization_id: null,
        p_event_type: "refresh_snapshots",
        p_status: "error",
        p_duration_ms: duration,
        p_metadata: { source },
        p_error_code: (e as Error).message?.slice(0, 200) ?? "unknown",
      });
      if (logError) console.error("log_benchmark_event failed", logError);
    } catch (logErr) {
      console.error("log_benchmark_event threw", logErr);
    }
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
