import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  organizations?: { name?: string } | null;
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!domain) return "unknown";
  return `${name.slice(0, 2)}***@${domain}`;
};

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth_user_lookup_failed: ${error.message}`);
    const found = data?.users?.find((u: any) => (u.email || "").toLowerCase() === target);
    if (found) return found;
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return null;
}

async function attachMembershipAndAccept(
  admin: ReturnType<typeof createClient>,
  invite: InviteRow,
  userId: string,
  attemptId: string,
) {
  const { error: memErr } = await admin
    .from("org_memberships")
    .upsert(
      { organization_id: invite.organization_id, user_id: userId, role: invite.role },
      { onConflict: "organization_id,user_id" },
    );
  if (memErr) throw new Error(`membership_upsert_failed: ${memErr.message}`);

  const acceptPatch = invite.accepted_at
    ? { accepted_by: invite.accepted_by || userId }
    : { accepted_at: new Date().toISOString(), accepted_by: userId };

  const { error: acceptErr } = await admin
    .from("organization_invites")
    .update(acceptPatch)
    .eq("id", invite.id);
  if (acceptErr) throw new Error(`invite_accept_update_failed: ${acceptErr.message}`);

  console.log(`[accept-team-invite] ${attemptId} accepted invite=${invite.id} org=${invite.organization_id} role=${invite.role}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const attemptId = crypto.randomUUID();

  try {
    const { token, mode, password, full_name } = await req.json() as {
      token: string; mode?: 'preview' | 'accept' | 'signup'; password?: string; full_name?: string;
    };
    if (!token) {
      console.warn(`[accept-team-invite] ${attemptId} missing_token`);
      return json({ error: "missing_token", attempt_id: attemptId }, 400);
    }

    const { data: invite, error: invErr } = await admin
      .from("organization_invites")
      .select("id, organization_id, email, role, expires_at, accepted_at, accepted_by, organizations(name)")
      .eq("token", token)
      .maybeSingle();
    if (invErr || !invite) {
      const reason = invErr?.message || "invite_not_found";
      console.warn(`[accept-team-invite] ${attemptId} invite lookup failed: ${reason}`);
      return json({ error: reason, code: "invite_not_found", attempt_id: attemptId }, 404);
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      console.warn(`[accept-team-invite] ${attemptId} expired invite=${invite.id}`);
      return json({ error: "expired", attempt_id: attemptId }, 400);
    }

    const orgName = (invite as any).organizations?.name || "the organization";
    const normalizedEmail = invite.email.toLowerCase();
    console.log(`[accept-team-invite] ${attemptId} mode=${mode || "accept"} invite=${invite.id} email=${maskEmail(normalizedEmail)}`);

    if (mode === 'preview') {
      return json({
        email: invite.email,
        role: invite.role,
        organization_name: orgName,
        already_accepted: Boolean(invite.accepted_at),
        attempt_id: attemptId,
      });
    }

    // Signup mode: for existing users, accept the invite and ask the client to sign in.
    // For new users, create a confirmed auth user, attach membership, then client signs in.
    if (mode === 'signup') {
      if (!password || password.length < 8) {
        console.warn(`[accept-team-invite] ${attemptId} weak_password invite=${invite.id}`);
        return json({ error: "weak_password", attempt_id: attemptId }, 400);
      }

      const found = await findAuthUserByEmail(admin, normalizedEmail);
      if (found) {
        await attachMembershipAndAccept(admin, invite as InviteRow, found.id, attemptId);
        return json({
          success: true,
          existing_user: true,
          requires_sign_in: true,
          email: invite.email,
          organization_id: invite.organization_id,
          role: invite.role,
          message: "Existing account found. Sign in with the existing password to continue.",
          attempt_id: attemptId,
        });
      }

      if (invite.accepted_at) {
        console.warn(`[accept-team-invite] ${attemptId} already_accepted_without_auth_user invite=${invite.id}`);
        return json({ error: "already_accepted", attempt_id: attemptId }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || '' },
      });
      if (createErr) throw new Error(`auth_create_user_failed: ${createErr.message}`);
      if (!created.user?.id) throw new Error("auth_create_user_failed: missing user id");

      await attachMembershipAndAccept(admin, invite as InviteRow, created.user.id, attemptId);

      return json({
        success: true,
        created: true,
        requires_sign_in: true,
        email: invite.email,
        organization_id: invite.organization_id,
        role: invite.role,
        attempt_id: attemptId,
      });
    }


    // Accept mode: must be authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.warn(`[accept-team-invite] ${attemptId} auth_required invite=${invite.id}`);
      return json({ error: "auth_required", attempt_id: attemptId }, 401);
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userRes, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !userRes.user) {
      const reason = authErr?.message || "invalid_token";
      console.warn(`[accept-team-invite] ${attemptId} invalid token: ${reason}`);
      return json({ error: reason, code: "invalid_token", attempt_id: attemptId }, 401);
    }
    const user = userRes.user;

    if ((user.email || "").toLowerCase() !== normalizedEmail) {
      console.warn(`[accept-team-invite] ${attemptId} email_mismatch invite=${invite.id}`);
      return json({ error: "email_mismatch", expected: invite.email, attempt_id: attemptId }, 403);
    }

    await attachMembershipAndAccept(admin, invite as InviteRow, user.id, attemptId);

    return json({
      success: true, organization_id: invite.organization_id, role: invite.role, attempt_id: attemptId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[accept-team-invite] ${attemptId} failed: ${message}`);
    return json({ error: message, attempt_id: attemptId }, 500);
  }
});
