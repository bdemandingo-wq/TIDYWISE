// Optional Prerender.io recache trigger fired when a blog post is published.
// Future-proofed: if PRERENDER_TOKEN is not set, logs a warning and exits 200
// silently so the publish flow never fails because of missing CDN config.
//
// Setup later (when Cloudflare/Prerender CDN is in front of jointidywise.com):
//   1. Add PRERENDER_TOKEN as an edge function secret.
//   2. This function will start recaching on every publish automatically.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SITE_DOMAIN = "https://jointidywise.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RecacheBody {
  slug?: string;
  url?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RecacheBody;
    const targetUrl =
      body.url ||
      (body.slug ? `${SITE_DOMAIN}/blog/post/${body.slug}` : null);

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing slug or url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = Deno.env.get("PRERENDER_TOKEN");
    if (!token) {
      console.warn("[recache-blog-post] PRERENDER_TOKEN not configured — skipping recache for", targetUrl);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "PRERENDER_TOKEN not set", url: targetUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.prerender.io/recache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prerenderToken: token, url: targetUrl }),
    });

    const ok = res.ok;
    const text = await res.text().catch(() => "");
    if (!ok) {
      console.error("[recache-blog-post] Prerender API error", res.status, text);
    } else {
      console.log("[recache-blog-post] Recached", targetUrl);
    }

    return new Response(
      JSON.stringify({ ok, status: res.status, url: targetUrl, response: text.slice(0, 500) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[recache-blog-post] error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// NOTE: A "prerender-proxy" middleware function (to forward bot user-agents to
// service.prerender.io) cannot work on Lovable hosting because per-route
// edge middleware in front of the React SPA is not supported. To enable bot
// prerendering, route /blog/* through Cloudflare Workers (or migrate hosting
// to Vercel/Netlify) and proxy bot traffic there. The recache flow above will
// keep Prerender's cache warm regardless of which proxy you choose.
