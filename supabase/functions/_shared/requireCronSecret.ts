// Shared helper: rejects any request that doesn't carry the correct
// x-cron-secret header. Use at the top of cron-driven edge functions.
//
//   const cronGate = requireCronSecret(req);
//   if (cronGate) return cronGate;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    // Fail closed if the secret isn't configured.
    return new Response(
      JSON.stringify({ error: "CRON_SECRET not configured on server" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
}
