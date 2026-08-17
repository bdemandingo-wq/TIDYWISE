// Records WHO REFERRED WHOM, at the moment the referred org is created.
//
// WHY THIS IS A SERVER FUNCTION AND NOT A CLIENT INSERT
// `public.organizations`' INSERT policy is `(auth.uid() = owner_id)` and does
// not enumerate columns, so an authenticated user can already write any column
// on their own org row. If attribution were client-writable a user could name
// any referrer, mark themselves 'qualified', or grant themselves months. So the
// four org_referral* tables carry SELECT policies only and every write goes
// through the service role. The client sends an org id and a code; this
// function decides everything else.
//
// NO config.toml ENTRY ON PURPOSE. With no entry the function defaults to
// verify_jwt = true, which is what we want — the caller must be logged in.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { rejectReason } from "../_shared/referral-eligibility.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const log = (step: string, details?: unknown) =>
  console.log(`[claim-referral] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

/**
 * Server-side normalisation. Never trust the client's version.
 * Must match `normalizeReferralCode` in src/lib/referralCode.ts.
 */
function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length === 0 ? null : cleaned;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // ── 1. Authenticate the caller ────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: userData } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId =
      typeof body.organization_id === "string" ? body.organization_id : null;
    if (!organizationId) return json({ error: "organization_id is required" }, 400);

    // ── 2. The caller must OWN the supplied org ───────────────────────────
    // The client supplies organization_id, so without this anyone could claim
    // a referral on behalf of someone else's org.
    const { data: membership } = await admin
      .from("org_memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    if (!membership) {
      log("forbidden — not owner", { userId: user.id, organizationId });
      return json({ error: "Forbidden" }, 403);
    }

    // ── 3. Normalise the code server-side ─────────────────────────────────
    const code = normalizeReferralCode(
      typeof body.referral_code === "string" ? body.referral_code : null,
    );
    if (!code) return json({ outcome: "no_code" });

    // ── 4. Resolve the code to a referrer ─────────────────────────────────
    const { data: codeRow } = await admin
      .from("org_referral_codes")
      .select("organization_id")
      .eq("code", code)
      .maybeSingle();

    let referrerOrgId: string | null = codeRow?.organization_id ?? null;
    let reason: string | null = referrerOrgId ? null : "invalid_code";

    // ── 5. Eligibility ────────────────────────────────────────────────────
    if (referrerOrgId) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, owner_id, plan_type")
        .in("id", [referrerOrgId, organizationId]);

      const referrerOrg = orgs?.find((o: any) => o.id === referrerOrgId);
      const referredOrg = orgs?.find((o: any) => o.id === organizationId);

      if (!referrerOrg || !referredOrg) {
        reason = "invalid_code";
      } else {
        // cardFingerprint is NULL for both here and that is CORRECT: the card
        // check runs at the referred org's first payment (stripe-invoice-webhook),
        // which is the first moment a card exists.
        reason = rejectReason(
          {
            orgId: referrerOrg.id,
            ownerId: referrerOrg.owner_id,
            planType: referrerOrg.plan_type ?? null,
            cardFingerprint: null,
          },
          {
            orgId: referredOrg.id,
            ownerId: referredOrg.owner_id,
            planType: referredOrg.plan_type ?? null,
            cardFingerprint: null,
          },
        );
      }
    }

    // ── 6. Exactly ONE insert, accepted or rejected ───────────────────────
    // Rejections are recorded deliberately: they give an audit trail, and
    // because org_referrals has UNIQUE(referred_org_id) they stop an org
    // retrying different codes until one sticks. If a legitimate claim is ever
    // rejected in error, an ADMIN DELETES THE ROW to allow a re-claim — do not
    // "fix" this later by skipping the insert.
    const insertRow = {
      referral_code: code,
      // A rejected 'invalid_code' claim has no referrer; park it on the
      // referred org itself would violate the no-self CHECK, so we cannot
      // store a row without a referrer. Handled below.
      referrer_org_id: referrerOrgId,
      referred_org_id: organizationId,
      status: reason ? "rejected" : "pending",
      rejection_reason: reason,
    };

    if (!referrerOrgId) {
      // No referrer to attribute to and referrer_org_id is NOT NULL, so there
      // is nothing to record. Report the rejection without a row.
      log("invalid code", { code, organizationId });
      return json({ outcome: "rejected", reason: "invalid_code" });
    }

    const { error: insertError } = await admin.from("org_referrals").insert(insertRow);

    if (insertError) {
      const codeStr = (insertError as any).code;
      if (codeStr === "23505") {
        log("already claimed", { organizationId });
        return json({ outcome: "already_claimed" });
      }
      if (codeStr === "23514") {
        // org_referrals_no_self fired. Normal business outcome, not a 500.
        return json({ outcome: "rejected", reason: "self_referral_same_org" });
      }
      throw insertError;
    }

    // ── 8. Make sure the REFERRER has a ledger row (zero months for now) ──
    await admin
      .from("org_referral_credits")
      .upsert({ organization_id: referrerOrgId }, { onConflict: "organization_id", ignoreDuplicates: true });

    if (reason) {
      log("rejected", { organizationId, reason });
      return json({ outcome: "rejected", reason });
    }

    log("claimed", { organizationId, referrerOrgId, code });
    return json({ outcome: "claimed" });
  } catch (e) {
    console.error("[claim-referral] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
