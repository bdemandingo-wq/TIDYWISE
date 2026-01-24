import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_EMAIL = "support@tidywisecleaning.com";

type SessionRow = {
  user_id: string | null;
  user_email: string | null;
  duration_seconds: number | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Authentication error: Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userEmail = claimsData.claims.email as string | undefined;

    if (!userEmail || userEmail !== PLATFORM_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Unauthorized: Platform admin access only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const days = Number(body?.days ?? 30);
    const safeDays = Number.isFinite(days) && days > 0 && days <= 365 ? days : 30;

    const startIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

    // IMPORTANT:
    // PostgREST has a default max of 1000 rows per request.
    // We must paginate and aggregate server-side.
    const pageSize = 1000;
    const maxPages = 100; // safety cap (100k sessions)

    const userStats: Record<
      string,
      { user_id: string; user_email: string; total_duration_seconds: number; session_count: number }
    > = {};
    let totalDuration = 0;
    let totalSessions = 0;

    for (let page = 0; page < maxPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabaseAdmin
        .from("user_sessions")
        .select("user_id, user_email, duration_seconds")
        .gte("session_start", startIso)
        .order("session_start", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = (data ?? []) as SessionRow[];
      if (rows.length === 0) break;

      for (const row of rows) {
        const userId = row.user_id ?? "__unknown__";
        const email = row.user_email ?? "Unknown";
        const duration = row.duration_seconds ?? 0;

        totalDuration += duration;
        totalSessions++;

        if (!userStats[userId]) {
          userStats[userId] = {
            user_id: userId,
            user_email: email,
            total_duration_seconds: 0,
            session_count: 0,
          };
        }

        userStats[userId].total_duration_seconds += duration;
        userStats[userId].session_count++;

        // Preserve the first non-unknown email we see
        if (userStats[userId].user_email === "Unknown" && email !== "Unknown") {
          userStats[userId].user_email = email;
        }
      }

      if (rows.length < pageSize) break;
    }

    const avgSessionDuration = totalSessions > 0 ? Math.floor(totalDuration / totalSessions) : 0;
    const userList = Object.values(userStats).sort(
      (a, b) => b.total_duration_seconds - a.total_duration_seconds
    );

    return new Response(
      JSON.stringify({
        avgSessionDuration,
        totalSessions,
        userList,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
