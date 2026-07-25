// Platform-admin only — proxy to Sentry Issues API.
// Reads SENTRY_AUTH_TOKEN from edge function secrets. Never exposed to client.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeParseSentryError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    return typeof parsed.detail === "string" ? parsed.detail : text;
  } catch {
    return text;
  }
}

// Decode `sntrys_<base64payload>_<sig>` tokens to discover the org slug and
// region URL, so we don't have to hardcode them.
function decodeSentryToken(token: string): {
  org?: string;
  url?: string;
  region_url?: string;
} | null {
  try {
    if (!token.startsWith("sntrys_")) return null;
    const parts = token.split("_");
    if (parts.length < 2) return null;
    const payload = parts[1];
    // base64url -> base64
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: udata } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (!udata?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin, error: adminErr } = await userClient.rpc(
      "is_platform_admin",
    );
    if (adminErr || !isAdmin) {
      return json({ error: "Platform admin only" }, 403);
    }

    const token = Deno.env.get("SENTRY_AUTH_TOKEN")?.trim().replace(/\s+/g, "");
    if (!token) {
      return json({ error: "SENTRY_AUTH_TOKEN not configured" }, 500);
    }

    const meta = decodeSentryToken(token);
    const url0 = new URL(req.url);
    const orgSlug =
      url0.searchParams.get("org") ?? meta?.org ?? "jointidywise";
    const base = meta?.region_url
      ? `${meta.region_url.replace(/\/$/, "")}/api/0`
      : "https://sentry.io/api/0";
    console.log("[SENTRY-ISSUES] token prefix:", token.slice(0, 7), "org:", orgSlug, "base:", base);

    const url = url0;

    // Optional single-issue mode: fetch the latest event and return distilled
    // stack frames (file:line) so "Copy Fix Prompt" carries real locations, not
    // just culprit + permalink. issueId comes from the POST body
    // (supabase.functions.invoke) or a ?issueId= query param.
    let bodyIssueId: string | undefined;
    if (req.method === "POST") {
      try {
        const b = await req.json();
        if (b && typeof b.issueId === "string") bodyIssueId = b.issueId;
      } catch { /* no/empty body — fall through to the issues list */ }
    }
    const issueId = url.searchParams.get("issueId") ?? bodyIssueId;

    if (issueId) {
      const evUrl = `${base}/issues/${encodeURIComponent(issueId)}/events/latest/`;
      const evResp = await fetch(evUrl, { headers: { Authorization: `Bearer ${token}` } });
      const evText = await evResp.text();
      if (!evResp.ok) {
        return json({ error: "Sentry event API error", status: evResp.status, detail: safeParseSentryError(evText) }, 502);
      }
      let ev: any = {};
      try { ev = JSON.parse(evText); } catch { /* leave ev empty */ }
      const entries: any[] = Array.isArray(ev?.entries) ? ev.entries : [];
      const exc = entries.find((e) => e?.type === "exception");
      const stack = entries.find((e) => e?.type === "stacktrace");
      let raw: any[] = [];
      if (exc?.data?.values?.length) {
        raw = exc.data.values[exc.data.values.length - 1]?.stacktrace?.frames ?? [];
      } else if (Array.isArray(stack?.data?.frames)) {
        raw = stack.data.frames;
      }
      // Sentry lists frames caller→callee; reverse so the throwing frame is
      // first. Prefer in-app frames; if none are flagged, keep them all.
      const ordered = [...raw].reverse();
      const inApp = ordered.filter((f) => f?.inApp);
      const frames = (inApp.length ? inApp : ordered).slice(0, 12).map((f) => ({
        filename: f?.filename ?? f?.absPath ?? f?.module ?? null,
        lineNo: f?.lineNo ?? null,
        colNo: f?.colNo ?? null,
        function: f?.function ?? null,
        inApp: !!f?.inApp,
      }));
      return json({ issueId, culprit: ev?.culprit ?? null, frames });
    }

    const query = url.searchParams.get("query") ?? "is:unresolved";
    const limit = url.searchParams.get("limit") ?? "25";

    const sentryUrl =
      `${base}/organizations/${orgSlug}/issues/?` +
      new URLSearchParams({ query, limit }).toString();

    const resp = await fetch(sentryUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await resp.text();
    if (!resp.ok) {
      const detail = safeParseSentryError(text);
      const hint =
        resp.status === 403
          ? "Create or update the Sentry auth token with org:read, project:read, and event:read scopes, then save it as SENTRY_AUTH_TOKEN."
          : undefined;
      return json(
        {
          error: "Sentry API error",
          status: resp.status,
          detail,
          hint,
        },
        resp.status === 401 || resp.status === 403 ? 403 : 502,
      );
    }

    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log("[SENTRY-ISSUES] ERROR", msg);
    return json({ error: msg }, 500);
  }
});
