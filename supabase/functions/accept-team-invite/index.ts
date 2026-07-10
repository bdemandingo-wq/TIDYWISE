import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const { token, mode, password, full_name } = await req.json() as {
      token: string; mode?: 'preview' | 'accept' | 'signup'; password?: string; full_name?: string;
    };
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invite, error: invErr } = await admin
      .from("organization_invites")
      .select("id, organization_id, email, role, expires_at, accepted_at, organizations(name)")
      .eq("token", token)
      .maybeSingle();
    if (invErr || !invite) {
      return new Response(JSON.stringify({ error: "invite_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (invite.accepted_at) {
      return new Response(JSON.stringify({ error: "already_accepted" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgName = (invite as any).organizations?.name || "the organization";

    if (mode === 'preview') {
      return new Response(JSON.stringify({
        email: invite.email, role: invite.role, organization_name: orgName,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Signup mode: create a confirmed auth user server-side, then let client sign in.
    if (mode === 'signup') {
      if (!password || password.length < 8) {
        return new Response(JSON.stringify({ error: "weak_password" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Check if user already exists
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = existing?.users?.find((u: any) => (u.email || '').toLowerCase() === invite.email.toLowerCase());
      if (found) {
        return new Response(JSON.stringify({ error: "user_exists", email: invite.email }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: createErr } = await admin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || '' },
      });
      if (createErr) throw createErr;
      return new Response(JSON.stringify({ success: true, created: true, email: invite.email }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Accept mode: must be authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userRes, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userRes.user;

    if ((user.email || "").toLowerCase() !== invite.email.toLowerCase()) {
      return new Response(JSON.stringify({ error: "email_mismatch", expected: invite.email }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert membership
    const { error: memErr } = await admin
      .from("org_memberships")
      .upsert({ organization_id: invite.organization_id, user_id: user.id, role: invite.role },
        { onConflict: 'organization_id,user_id' });
    if (memErr) throw memErr;

    await admin.from("organization_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
      .eq("id", invite.id);

    return new Response(JSON.stringify({
      success: true, organization_id: invite.organization_id, role: invite.role,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
