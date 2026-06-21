import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function page(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f9fafb;color:#111827;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;padding:32px;border-radius:12px;max-width:480px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}
h1{margin:0 0 12px;font-size:20px}p{color:#6b7280;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(page("Invalid link", "This unsubscribe link is missing a token."), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: tok } = await supabase
    .from("email_unsubscribe_tokens")
    .select("email")
    .eq("token", token)
    .maybeSingle();

  if (!tok?.email) {
    return new Response(page("Invalid link", "We couldn't find this unsubscribe request. It may have already been processed."), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "text/html" },
    });
  }

  const email = tok.email.toLowerCase();

  await supabase
    .from("profiles")
    .update({ email_unsubscribed: true, email_unsubscribed_at: new Date().toISOString() })
    .ilike("email", email);

  await supabase
    .from("suppressed_emails")
    .upsert({ email, reason: "user_unsubscribed" }, { onConflict: "email" })
    .then(() => {}, () => {});

  await supabase
    .from("email_unsubscribe_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);

  return new Response(
    page("You're unsubscribed", `<strong>${email}</strong> will no longer receive Morning Briefs, End of Day Reports, or marketing emails from TidyWise. You'll still receive essential account and transactional emails.`),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html" } }
  );
});
