import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Owner-initiated organization deletion.
 *
 * Hard rules:
 * 1. Caller must be authenticated.
 * 2. Caller must hold role=owner in org_memberships for the target org.
 * 3. Caller must still belong to at least one OTHER org afterward — this
 *    endpoint refuses to delete the last remaining org so a user can never
 *    accidentally lock themselves out via the switcher. Full-account
 *    deletion lives in delete-my-account.
 * 4. Target org_id required and validated as a uuid.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = body?.organizationId;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!organizationId || !uuidRe.test(organizationId)) {
      return new Response(JSON.stringify({ error: "Invalid organizationId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is owner of this org
    const { data: membership, error: memErr } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (memErr || !membership) {
      return new Response(JSON.stringify({ error: "You are not a member of that organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (membership.role !== "owner") {
      return new Response(JSON.stringify({ error: "Only the owner can delete an organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure the caller has at least one OTHER org
    const { count, error: countErr } = await supabase
      .from("org_memberships")
      .select("organization_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("organization_id", organizationId);
    if (countErr) throw countErr;
    if (!count || count < 1) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your only business. Add another first, or delete your account." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cascade — same approach as delete-platform-account
    await supabase.from("org_memberships").delete().eq("organization_id", organizationId);
    const { error: delErr } = await supabase
      .from("organizations")
      .delete()
      .eq("id", organizationId);
    if (delErr) {
      console.error("[delete-my-organization] delete failed", delErr);
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[delete-my-organization] org ${organizationId} deleted by user ${user.id}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[delete-my-organization] error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
