// copilot-mark-milestone — internal helper for marking activation milestones
// complete on a per-org onboarding_progress row. Called by the frontend (and
// in Phase 2, by other parts of the app whose actions trigger milestones).
//
// Idempotent: if the milestone is already complete, this is a no-op. Marking
// milestone 6 also sets activated_at if it isn't already.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireOrgAdmin, sharedCorsHeaders } from "../_shared/requireOrgAdmin.ts";

type Milestone = 1 | 2 | 3 | 4 | 5 | 6;

const MILESTONE_COLUMNS: Record<Milestone, string> = {
  1: "milestone_1_company_info_completed_at",
  2: "milestone_2_services_pricing_completed_at",
  3: "milestone_3_clients_added_completed_at",
  4: "milestone_4_staff_added_completed_at",
  5: "milestone_5_stripe_connected_completed_at",
  6: "milestone_6_first_booking_completed_at",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: sharedCorsHeaders });
  }

  let body: { organization_id?: string; milestone?: number } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const organizationId = body.organization_id;
  const milestone = body.milestone;
  if (!organizationId || typeof organizationId !== "string") {
    return jsonError(400, "organization_id required");
  }
  if (!milestone || ![1, 2, 3, 4, 5, 6].includes(milestone)) {
    return jsonError(400, "milestone must be an integer 1–6");
  }

  // Members (not just owners/admins) can mark milestones — any signed-in
  // teammate's actions can drive activation forward.
  const auth = await requireOrgAdmin(req, organizationId, { allowMember: true });
  if (auth instanceof Response) return auth;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonError(500, "Supabase configuration missing");
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const column = MILESTONE_COLUMNS[milestone as Milestone];
  const now = new Date().toISOString();

  // Read-modify-write so we can leave existing completed_at values alone (the
  // first completion timestamp is the meaningful one).
  const { data: existing, error: readError } = await supabase
    .from("onboarding_progress")
    .select("id, " + Object.values(MILESTONE_COLUMNS).join(", ") + ", activated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (readError) {
    return jsonError(500, `Failed to read onboarding_progress: ${readError.message}`);
  }

  const existingRow = existing as Record<string, string | null> | null;
  const alreadyDone = !!existingRow?.[column];

  const update: Record<string, string | null> = {};
  if (!alreadyDone) update[column] = now;

  // Compute "all 6 done" by merging the current row + the pending update.
  const willBeComplete: Record<string, string | null | undefined> = {
    ...existingRow,
    ...update,
  };
  const allDone = ([1, 2, 3, 4, 5, 6] as Milestone[]).every(
    (m) => willBeComplete[MILESTONE_COLUMNS[m]],
  );
  if (allDone && !existingRow?.activated_at) {
    update.activated_at = now;
  }

  if (existingRow) {
    if (Object.keys(update).length === 0) {
      // Already complete and already activated — return current state.
      return jsonOk({ status: "noop", row: existingRow });
    }
    const { data: updated, error: updateError } = await supabase
      .from("onboarding_progress")
      .update(update)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (updateError) {
      return jsonError(500, `Failed to update onboarding_progress: ${updateError.message}`);
    }
    return jsonOk({
      status: alreadyDone ? "already_done" : "marked",
      milestone,
      activated: !!update.activated_at,
      row: updated,
    });
  }

  // No row yet — insert one with this milestone set.
  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    [column]: now,
  };
  if (allDone) insertPayload.activated_at = now;

  const { data: inserted, error: insertError } = await supabase
    .from("onboarding_progress")
    .insert(insertPayload)
    .select()
    .single();
  if (insertError) {
    return jsonError(500, `Failed to insert onboarding_progress: ${insertError.message}`);
  }
  return jsonOk({
    status: "marked",
    milestone,
    activated: !!insertPayload.activated_at,
    row: inserted,
  });
});

function jsonError(status: number, error: string): Response {
  return new Response(
    JSON.stringify({ success: false, error }),
    {
      status,
      headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
    },
  );
}

function jsonOk(payload: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ success: true, ...payload }),
    {
      status: 200,
      headers: { ...sharedCorsHeaders, "Content-Type": "application/json" },
    },
  );
}
