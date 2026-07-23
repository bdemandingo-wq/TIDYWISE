// Notifies org admins when a booking is marked completed: inserts an
// admin bell notification and fires an APNs push to admin devices.
//
// Auth: standard user JWT (admin or staff-portal account). The caller's org
// is resolved from their own membership/staff record — never from the body —
// and the booking must belong to that org. Push goes out server-to-server
// via send-push-notification, which only accepts service-role callers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolveCallerOrg } from "../_shared/require-caller-org.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await resolveCallerOrg(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const { bookingId, completedBy } = await req.json() as {
      bookingId?: string;
      completedBy?: "staff" | "admin";
    };
    if (!bookingId) return json({ error: "bookingId required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: booking, error } = await admin
      .from("bookings")
      .select("id, booking_number, organization_id, status, staff:staff(name), customer:customers(first_name, last_name)")
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !booking) return json({ error: "Booking not found" }, 404);
    if (booking.organization_id !== auth.ctx.organizationId) {
      return json({ error: "Booking does not belong to your organization" }, 403);
    }
    if (booking.status !== "completed") {
      return json({ error: "Booking is not completed" }, 400);
    }

    const dedupeKey = `job_completed:${booking.id}`;

    // dedupe index on (organization_id, dedupe_key) is partial, so upsert
    // can't target it — check first, and treat a conflict on insert as a
    // concurrent duplicate.
    const { data: existing } = await admin
      .from("admin_system_notifications")
      .select("id")
      .eq("organization_id", booking.organization_id)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing) return json({ success: true, deduped: true });

    const c = booking.customer as { first_name?: string; last_name?: string } | null;
    const who = c?.first_name ? `${c.first_name} ${c.last_name ?? ""}`.trim() : "Customer";
    const staffName = (booking.staff as { name?: string } | null)?.name;
    const ref = booking.booking_number ? `#${booking.booking_number}` : `#${booking.id.slice(0, 8)}`;
    const title = completedBy === "admin" ? "✅ Booking completed" : "✅ Job marked complete by staff";
    const message = staffName && completedBy !== "admin"
      ? `${staffName} completed Booking ${ref} for ${who}.`
      : `Booking ${ref} for ${who} was completed.`;

    const { error: insertError } = await admin.from("admin_system_notifications").insert({
      organization_id: booking.organization_id,
      type: "job_completed",
      title,
      message,
      link: "/admin/bookings",
      metadata: { booking_id: booking.id },
      dedupe_key: dedupeKey,
    });
    if (insertError) {
      if (insertError.code === "23505") return json({ success: true, deduped: true });
      throw insertError;
    }

    // Fire-and-forget push to admin devices (send-push-notification is
    // service-role-only, so this must be a server-to-server call).
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        organization_id: booking.organization_id,
        title,
        body: message,
        data: { bookingId: booking.id },
      }),
    }).catch(() => {});

    return json({ success: true });
  } catch (e) {
    console.error("[notify-job-completed]", e);
    return json({ error: e instanceof Error ? e.message : "unexpected" }, 500);
  }
});
