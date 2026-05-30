// Shared helper: authenticate a user from the Authorization header and load
// their primary organization id. Used by self-serve subscription flow functions.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface AuthedContext {
  supabase: SupabaseClient;
  userId: string;
  userEmail: string;
  organizationId: string | null;
}

export async function authenticateUser(req: Request): Promise<
  | { ok: true; ctx: AuthedContext }
  | { ok: false; status: number; error: string }
> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid token" };
  }
  const user = userData.user;
  if (!user.email) {
    return { ok: false, status: 401, error: "Missing user email" };
  }

  // Pick the primary org for this user (owner first, otherwise first membership)
  const { data: memberships } = await supabase
    .from("org_memberships")
    .select("organization_id, role")
    .eq("user_id", user.id);

  let organizationId: string | null = null;
  if (memberships && memberships.length > 0) {
    const owner = memberships.find((m: any) => m.role === "owner");
    organizationId = (owner ?? memberships[0]).organization_id ?? null;
  }

  return {
    ok: true,
    ctx: { supabase, userId: user.id, userEmail: user.email, organizationId },
  };
}
