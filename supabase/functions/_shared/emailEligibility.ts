// Shared helper to determine whether a non-transactional email should be sent
// to a given organization owner. Used by Morning Brief and End of Day Report.

import { createClient } from "npm:@supabase/supabase-js@2";

export type Eligibility =
  | { ok: true; email: string; ownerId: string; unsubscribeUrl: string }
  | { ok: false; reason: string };

const ACTIVE_STATUSES = new Set(["active", "trial", "trialing"]);
const BLOCKED_STATUSES = new Set(["canceled", "cancelled", "past_due", "unpaid", "incomplete_expired"]);

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkOrgEmailEligibility(
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<Eligibility> {
  // 1. Resolve owner
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.owner_id) return { ok: false, reason: "no_owner" };

  // 2. Subscription gate: blocked if canceled/past_due. Active or trial OK.
  //    Prefer stripe_subscriptions, fall back to profile status.
  const { data: sub } = await supabase
    .from("stripe_subscriptions")
    .select("status")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, email_unsubscribed, subscription_status")
    .eq("id", org.owner_id)
    .maybeSingle();

  const status = (sub?.status || profile?.subscription_status || "trial").toLowerCase();

  if (BLOCKED_STATUSES.has(status)) {
    return { ok: false, reason: `subscription_${status}` };
  }
  if (!ACTIVE_STATUSES.has(status) && status !== "free") {
    // Unknown statuses default to blocked for safety
    return { ok: false, reason: `subscription_${status}` };
  }

  // 3. Recipient email + unsubscribe gate
  let email = profile?.email ?? null;
  if (!email) {
    const { data: u } = await supabase.auth.admin.getUserById(org.owner_id);
    email = u?.user?.email ?? null;
  }
  if (!email) return { ok: false, reason: "no_email" };

  if (profile?.email_unsubscribed === true) {
    return { ok: false, reason: "user_unsubscribed" };
  }

  // 4. Issue/find unsubscribe token
  const normalized = email.toLowerCase();
  let token: string | null = null;
  const { data: existing } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token) {
    token = existing.token as string;
  } else {
    token = randomToken();
    await supabase
      .from("email_unsubscribe_tokens")
      .insert({ token, email: normalized });
  }

  const base = Deno.env.get("SUPABASE_URL");
  const unsubscribeUrl = `${base}/functions/v1/handle-email-unsubscribe?token=${token}`;

  return { ok: true, email, ownerId: org.owner_id, unsubscribeUrl };
}

export function unsubscribeFooterHtml(unsubscribeUrl: string) {
  return `<p style="text-align:center;color:#9ca3af;font-size:11px;margin:16px 0 0;line-height:1.5">
    You're receiving this because automated reports are enabled for your TidyWise account.<br/>
    <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline">Unsubscribe from automated emails</a>
  </p>`;
}
