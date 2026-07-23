// Platform-admin only. Manages access codes and comped_access grants.
// Actions: list_codes, create_code, deactivate_code, activate_code,
//          list_comps, grant_comp, revoke_comp
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_ORG_ID = "e95b92d0-7099-408e-a773-e4407b34f8b4";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomCode(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Not authenticated" });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return json(401, { error: "Not authenticated" });
    const user = userData.user;

    const { data: membership } = await supabaseAdmin
      .from("org_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", PLATFORM_ADMIN_ORG_ID)
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json(403, { error: "Platform admin only" });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {
      case "list_codes": {
        const { data, error } = await supabaseAdmin
          .from("access_codes")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json(200, { codes: data });
      }

      case "create_code": {
        const duration_days = Number(body.duration_days ?? 30);
        if (!Number.isFinite(duration_days) || duration_days <= 0) {
          return json(400, { error: "duration_days must be > 0" });
        }
        const code = (body.code as string | undefined)?.trim().toUpperCase() || randomCode(10);
        // Default max_uses = 1 (one-per-person). Explicit null = unlimited.
        let max_uses: number | null = 1;
        if (body.max_uses === null) {
          max_uses = null;
        } else if (body.max_uses !== undefined && body.max_uses !== "") {
          max_uses = Number(body.max_uses);
        }
        const expires_at = body.expires_at ?? null;
        const reason = (body.reason as string | undefined) ?? null;
        const rawLock = (body.email_lock as string | undefined)?.trim().toLowerCase();
        const email_lock = rawLock ? rawLock : null;

        const { data, error } = await supabaseAdmin
          .from("access_codes")
          .insert({
            code,
            duration_days,
            max_uses,
            expires_at,
            reason,
            email_lock,
            active: true,
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;
        return json(200, { code: data });
      }

      case "list_redemptions": {
        const access_code_id = body.access_code_id as string | undefined;
        let q = supabaseAdmin
          .from("access_code_redemptions")
          .select("id, access_code_id, user_id, organization_id, email, redeemed_at, organizations:organization_id(id,name)")
          .order("redeemed_at", { ascending: false })
          .limit(500);
        if (access_code_id) q = q.eq("access_code_id", access_code_id);
        const { data, error } = await q;
        if (error) throw error;
        return json(200, { redemptions: data });
      }

      case "deactivate_code":
      case "activate_code": {
        const id = body.id as string;
        if (!id) return json(400, { error: "id required" });
        const { data, error } = await supabaseAdmin
          .from("access_codes")
          .update({ active: action === "activate_code" })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return json(200, { code: data });
      }

      case "list_comps": {
        const { data, error } = await supabaseAdmin
          .from("comped_access")
          .select("*, organizations:organization_id(id,name), access_codes:access_code_id(code,email_lock)")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;

        // Enrich with owner email via org_memberships → profiles
        const orgIds = Array.from(new Set((data ?? []).map((r: any) => r.organization_id).filter(Boolean)));
        const ownerMap = new Map<string, string>();
        if (orgIds.length) {
          const { data: mems } = await supabaseAdmin
            .from("org_memberships")
            .select("organization_id, user_id, role")
            .in("organization_id", orgIds)
            .in("role", ["owner", "admin"]);
          const userIds = Array.from(new Set((mems ?? []).map((m: any) => m.user_id)));
          const { data: profs } = userIds.length
            ? await supabaseAdmin.from("profiles").select("id,email").in("id", userIds)
            : { data: [] as any[] };
          const emailById = new Map<string, string>();
          for (const p of profs ?? []) emailById.set(p.id, p.email ?? "");
          // prefer owner over admin
          const sorted = (mems ?? []).sort((a: any, b: any) => (a.role === "owner" ? -1 : 1));
          for (const m of sorted) {
            if (!ownerMap.has(m.organization_id)) {
              const em = emailById.get(m.user_id);
              if (em) ownerMap.set(m.organization_id, em);
            }
          }
        }
        const enriched = (data ?? []).map((r: any) => ({ ...r, owner_email: ownerMap.get(r.organization_id) ?? null }));
        return json(200, { comps: enriched });
      }

      case "grant_comp": {
        const organization_id = body.organization_id as string;
        const duration_days = Number(body.duration_days ?? 30);
        const reason = (body.reason as string | undefined) ?? "Manual grant";
        if (!organization_id) return json(400, { error: "organization_id required" });
        if (!Number.isFinite(duration_days) || duration_days <= 0) {
          return json(400, { error: "duration_days must be > 0" });
        }
        const expires_at = new Date(Date.now() + duration_days * 86400_000).toISOString();
        const { data, error } = await supabaseAdmin
          .from("comped_access")
          .insert({
            organization_id,
            expires_at,
            granted_by: user.id,
            reason,
          })
          .select()
          .single();
        if (error) throw error;
        return json(200, { comp: data });
      }

      case "revoke_comp": {
        const id = body.id as string;
        if (!id) return json(400, { error: "id required" });
        const { data, error } = await supabaseAdmin
          .from("comped_access")
          .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return json(200, { comp: data });
      }

      default:
        return json(400, { error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[access-codes-admin] error:", msg);
    return json(500, { error: msg });
  }
});
