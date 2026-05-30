// TidyWise Score: self-serve claim — auto-approve, first-claim-wins.
// Requires an authenticated user. Locks the company to that user, logs to audit,
// and triggers a score recompute if sentiment evidence is missing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  slug: z.string().trim().min(1).max(200),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { slug } = parsed.data;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Resolve the calling user from the JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Atomic first-claim-wins: a single conditional UPDATE ... WHERE claimed_user_id IS NULL.
    // If a row comes back, this caller won the race. If not, either it's already claimed
    // (possibly by this same user — idempotent) or the slug doesn't exist.
    const nowIso = new Date().toISOString();
    const { data: claimedRows, error: uErr } = await admin
      .from("score_companies")
      .update({
        claimed: true,
        claimed_user_id: user.id,
        claimed_at: nowIso,
      } as any)
      .eq("slug", slug)
      .is("claimed_user_id", null)
      .select("id, slug");
    if (uErr) throw uErr;

    let company: { id: string; slug: string };
    let wonRace = false;

    if (claimedRows && claimedRows.length > 0) {
      company = claimedRows[0] as { id: string; slug: string };
      wonRace = true;
    } else {
      // Conditional update matched nothing. Disambiguate not_found vs already_claimed.
      const { data: existing } = await admin
        .from("score_companies")
        .select("id, slug, claimed_user_id")
        .eq("slug", slug)
        .maybeSingle();

      if (!existing) {
        return new Response(JSON.stringify({ error: "company_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (existing.claimed_user_id !== user.id) {
        // Lost the race / claimed by someone else. Do NOT write an audit row for the loser.
        return new Response(JSON.stringify({ error: "already_claimed" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Same user re-claiming — idempotent success, no new audit row.
      company = { id: existing.id, slug: existing.slug };
    }


    // Audit log only when this caller actually won the race (no rows for re-claims).
    if (wonRace) {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("cf-connecting-ip") ||
        null;
      const ua = req.headers.get("user-agent") || null;
      await admin
        .from("score_claim_audit")
        .insert({
          company_id: company.id,
          company_slug: company.slug,
          user_id: user.id,
          email: user.email ?? null,
          ip_address: ip,
          user_agent: ua,
          source: "self_serve_signup",
        })
        .then((r) => r.error && console.warn("audit insert failed", r.error));
    }

    // If sentiment evidence missing, kick a recompute (best effort, fire-and-forget).
    try {
      const { data: m } = await admin
        .from("score_company_metrics")
        .select("sentiment_evidence")
        .eq("company_id", company.id)
        .maybeSingle();
      const ev = (m?.sentiment_evidence ?? {}) as Record<string, unknown[]>;
      const hasAny = Object.values(ev).some((arr) => Array.isArray(arr) && arr.length > 0);
      if (!hasAny) {
        fetch(`${SUPABASE_URL}/functions/v1/score-compute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ company_id: company.id, force: true }),
        }).catch((e) => console.warn("score-compute trigger failed", e));
      }
    } catch (e) {
      console.warn("evidence check failed", e);
    }

    return new Response(
      JSON.stringify({ ok: true, company_id: company.id, slug: company.slug }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("score-claim-self error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
