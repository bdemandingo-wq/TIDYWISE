// Recache trigger fired when a blog post is published or edited.
// Tells Encited (the pre-render layer in front of jointidywise.com) to re-render
// a single URL so crawlers/AI engines immediately see fresh content.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SITE_DOMAIN = "https://www.jointidywise.com";
const DEFAULT_ENCITED_ENDPOINT = "https://encited.com/api/prerender/cache/invalidate-page-cache";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RecacheBody { slug?: string; url?: string; }
interface RecacheResult { ok: boolean; status?: number; response?: string; }

async function recacheViaEncited(targetUrl: string, token: string): Promise<RecacheResult> {
  const endpoint = Deno.env.get("ENCITED_RECACHE_ENDPOINT") || DEFAULT_ENCITED_ENDPOINT;
  const parsed = new URL(targetUrl);
  const domain = Deno.env.get("ENCITED_DOMAIN") || parsed.host;
  const path = parsed.pathname;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-lovablehtml-api-key": token },
    body: JSON.stringify({ domain, path, prewarm: true }),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, response: text.slice(0, 500) };
}

async function recacheViaPrerender(targetUrl: string, token: string): Promise<RecacheResult> {
  const res = await fetch("https://api.prerender.io/recache", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prerenderToken: token, url: targetUrl }),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, response: text.slice(0, 500) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json().catch(() => ({}))) as RecacheBody;
    const targetUrl = body.url || (body.slug ? `${SITE_DOMAIN}/blog/post/${body.slug}` : null);
    if (!targetUrl) {
      return new Response(JSON.stringify({ ok: false, error: "Missing slug or url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const encitedToken = Deno.env.get("ENCITED_API_TOKEN");
    const prerenderToken = Deno.env.get("PRERENDER_TOKEN");
    let provider: string; let result: RecacheResult;
    if (encitedToken) { provider = "encited"; result = await recacheViaEncited(targetUrl, encitedToken); }
    else if (prerenderToken) { provider = "prerender"; result = await recacheViaPrerender(targetUrl, prerenderToken); }
    else {
      console.warn("[recache-blog-post] No recache provider configured — skipping for", targetUrl);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no recache provider configured", url: targetUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!result.ok) console.error(`[recache-blog-post] ${provider} error`, result.status, result.response);
    else console.log(`[recache-blog-post] Recached via ${provider}:`, targetUrl);
    return new Response(JSON.stringify({ ok: result.ok, provider, status: result.status, url: targetUrl, response: result.response }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[recache-blog-post] error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
