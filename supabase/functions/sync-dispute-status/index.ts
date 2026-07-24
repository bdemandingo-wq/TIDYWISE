// Platform-admin: pull live status from Stripe for open (non-terminal) disputes
// and update the disputes table. Disputes resolved in the Stripe Dashboard fire
// charge.dispute.closed, which the webhook doesn't (yet) handle — and Stripe
// never re-sends it — so without this the panel shows stale needs_response and
// an active Submit button. The Evidence tab calls this on load + Refresh.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Stripe dispute statuses that are final.
const TERMINAL = ["won", "lost", "warning_closed"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    // User-scoped client so is_platform_admin() sees auth.uid().
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: udata } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!udata.user) throw new Error("Not authenticated");
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_platform_admin");
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: "Platform admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for the cross-tenant reads/writes the gate authorized.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Only re-check disputes that aren't already terminal locally.
    const { data: open, error: openErr } = await admin
      .from("disputes")
      .select("id, stripe_dispute_id, status")
      .not("status", "in", `(${TERMINAL.join(",")})`);
    if (openErr) throw openErr;

    let updated = 0;
    for (const d of open || []) {
      try {
        const sd = await stripe.disputes.retrieve(d.stripe_dispute_id as string);
        if (sd.status !== d.status) {
          await admin
            .from("disputes")
            .update({
              status: sd.status,
              outcome: TERMINAL.includes(sd.status) ? sd.status : null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", d.id);
          updated++;
        }
      } catch (e) {
        console.error("[sync-dispute-status] retrieve failed", d.stripe_dispute_id, e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, checked: open?.length ?? 0, updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-dispute-status] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
