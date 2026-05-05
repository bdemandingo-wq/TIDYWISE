import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "./gmail-crypto.ts";

export async function refreshGmailAccessToken(organizationId: string): Promise<
  { success: true; access_token: string; expires_at: string } | { success: false; error: string }
> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: conn } = await supabase
    .from("org_gmail_connections")
    .select("refresh_token_encrypted, status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!conn) return { success: false, error: "No Gmail connection" };
  if (conn.status === "revoked") return { success: false, error: "Connection revoked" };

  const refreshToken = await decryptToken(conn.refresh_token_encrypted);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    if (data.error === "invalid_grant") {
      await supabase
        .from("org_gmail_connections")
        .update({ status: "revoked" })
        .eq("organization_id", organizationId);
    }
    return { success: false, error: data.error || "refresh_failed" };
  }

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  await supabase
    .from("org_gmail_connections")
    .update({
      access_token: data.access_token,
      access_token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      status: "active",
    })
    .eq("organization_id", organizationId);

  return { success: true, access_token: data.access_token, expires_at: expiresAt };
}
