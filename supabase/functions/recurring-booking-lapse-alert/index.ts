// recurring-booking-lapse-alert — daily check for recurring bookings whose
// `next_scheduled_at` is in the past but no booking was generated, and pings
// the org owner so they can investigate.
//
// Schema note: the recurring_bookings table uses `next_scheduled_at` and
// `last_generated_at` (NOT next_occurrence_date / last_booking_date as the
// spec assumed). Frequency is text 'weekly'|'biweekly'|'monthly'.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireCronSecret } from "../_shared/requireCronSecret.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ADMIN_LINK_BASE = "https://app.jointidywise.com/dashboard/recurring";
const DEDUPE_DAYS = 7;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cronGate = requireCronSecret(req);
  if (cronGate) return cronGate;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing Supabase configuration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: enabledOrgs } = await supabase
    .from("organization_automations")
    .select("organization_id")
    .eq("automation_type", "recurring_lapse_alert")
    .eq("is_enabled", true);

  const summary = { orgs: 0, alerts: 0, skipped: 0, errors: 0 };
  const cutoff = new Date(Date.now() - DEDUPE_DAYS * 86_400_000).toISOString();
  // Anything that should have generated yesterday or earlier is "lapsed".
  const lapseCutoff = new Date(Date.now() - 86_400_000).toISOString();

  for (const row of enabledOrgs ?? []) {
    const orgId = row.organization_id as string;
    summary.orgs += 1;

    try {
      const { data: lapsed } = await supabase
        .from("recurring_bookings")
        .select(
          "id, customer_id, frequency, next_scheduled_at, last_generated_at",
        )
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .not("next_scheduled_at", "is", null)
        .lt("next_scheduled_at", lapseCutoff);

      for (const r of (lapsed ?? []) as Array<{
        id: string;
        customer_id: string | null;
        frequency: string;
        next_scheduled_at: string;
        last_generated_at: string | null;
      }>) {
        // Did the system actually catch up? Look for any booking tied to this
        // recurring whose scheduled_at is on/after (next - 1 day).
        const window = new Date(
          new Date(r.next_scheduled_at).getTime() - 86_400_000,
        ).toISOString();
        const { data: caughtUp, error: caughtUpErr } = await supabase
          .from("bookings")
          .select("id")
          .eq("recurring_booking_id", r.id)
          .gte("scheduled_at", window)
          .limit(1);
        if (caughtUpErr) {
          summary.errors += 1;
          console.error(
            `[recurring-booking-lapse-alert] catch-up check failed org=${orgId} recurring=${r.id}, skipping to be safe:`,
            caughtUpErr,
          );
          continue;
        }
        if (caughtUp && caughtUp.length > 0) {
          summary.skipped += 1;
          continue;
        }

        // Already alerted on this lapse within DEDUPE_DAYS?
        const { data: prior, error: dedupeErr } = await supabase
          .from("automation_fire_log")
          .select("id")
          .eq("organization_id", orgId)
          .eq("automation_type", "recurring_lapse_alert")
          .eq("target_id", r.id)
          .gte("fired_at", cutoff)
          .limit(1);
        if (dedupeErr) {
          // This is the exact failure mode that caused daily-repeat owner
          // alerts for the same lapse — fail closed instead of silently
          // treating an unreadable dedupe check as "never alerted".
          summary.errors += 1;
          console.error(
            `[recurring-booking-lapse-alert] dedupe check failed org=${orgId} recurring=${r.id}, skipping to avoid a possible duplicate alert:`,
            dedupeErr,
          );
          continue;
        }
        if (prior && prior.length > 0) {
          summary.skipped += 1;
          continue;
        }

        const sent = await alertOwner(supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          orgId,
          recurringId: r.id,
          customerId: r.customer_id,
          frequency: r.frequency,
          expectedDate: r.next_scheduled_at,
        });
        if (sent.ok) {
          summary.alerts += 1;
          const { error: logErr } = await supabase.from("automation_fire_log").insert({
            organization_id: orgId,
            automation_type: "recurring_lapse_alert",
            target_id: r.id,
            metadata: {
              expected_date: r.next_scheduled_at,
              customer_name: sent.customerName,
              frequency: r.frequency,
            },
          });
          if (logErr) {
            console.error(
              `[recurring-booking-lapse-alert] alert sent but fire-log insert failed org=${orgId} recurring=${r.id} — dedupe will not catch this next run:`,
              logErr,
            );
          }
        } else {
          summary.errors += 1;
          console.warn(
            `[recurring-booking-lapse-alert] Skipped recurring=${r.id}: ${sent.reason}`,
          );
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[recurring-booking-lapse-alert] Org ${orgId} threw:`, err);
    }
  }

  return new Response(
    JSON.stringify({ success: true, summary }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

async function alertOwner(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  args: {
    orgId: string;
    recurringId: string;
    customerId: string | null;
    frequency: string;
    expectedDate: string;
  },
): Promise<{ ok: boolean; reason?: string; customerName?: string }> {
  // Customer name for the alert body
  let customerName = "A recurring client";
  if (args.customerId) {
    const { data: cust } = await supabase
      .from("customers")
      .select("first_name, last_name")
      .eq("id", args.customerId)
      .maybeSingle();
    if (cust) {
      customerName = `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim() ||
        customerName;
    }
  }

  // Org owner phone — try profiles first (where phone usually lives), fall
  // back to business_settings.company_phone.
  const { data: org } = await supabase
    .from("organizations")
    .select("owner_id")
    .eq("id", args.orgId)
    .maybeSingle();
  let ownerPhone: string | null = null;
  if (org?.owner_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", org.owner_id)
      .maybeSingle();
    ownerPhone = (profile as { phone?: string | null } | null)?.phone ?? null;
  }
  if (!ownerPhone) {
    const { data: bs } = await supabase
      .from("business_settings")
      .select("company_phone")
      .eq("organization_id", args.orgId)
      .maybeSingle();
    ownerPhone = (bs as { company_phone?: string | null } | null)?.company_phone ?? null;
  }
  if (!ownerPhone) {
    return { ok: false, reason: "no owner phone on file" };
  }

  const expectedDateStr = new Date(args.expectedDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const adminLink = `${ADMIN_LINK_BASE}?id=${args.recurringId}`;
  const message = `⚠️ TidyWise alert: ${customerName}'s recurring cleaning (${args.frequency}) was due ${expectedDateStr} but no booking was created. Tap to review: ${adminLink}`;

  const res = await fetch(
    `${supabaseUrl}/functions/v1/send-openphone-sms`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: ownerPhone, message, organizationId: args.orgId }),
    },
  );
  const result = await res.json() as { success?: boolean; error?: string };
  if (!result.success) return { ok: false, reason: result.error ?? "sms send failed" };
  return { ok: true, customerName };
}
